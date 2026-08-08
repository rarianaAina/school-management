-- =============================================================================
-- 0018 — Presences
--
-- La feuille d'appel se rattache a une seance (lessons), pas a un creneau : un
-- cours annule ou deplace ne doit pas produire d'absences fantomes.
-- =============================================================================

create type public.attendance_status as enum (
  'present', 'absent', 'late', 'excused', 'left_early'
);

create type public.justification_status as enum ('pending', 'approved', 'rejected');

create table public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  status        public.attendance_status not null default 'present',
  minutes_late  smallint,
  comment       text,
  recorded_by   uuid references public.profiles(id) on delete set null,
  recorded_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint attendance_records_unique unique (lesson_id, student_id),
  constraint attendance_records_late_positive check (minutes_late is null or minutes_late >= 0)
);

create index attendance_records_student_idx on public.attendance_records (student_id, recorded_at desc);
create index attendance_records_lesson_idx on public.attendance_records (lesson_id);
create index attendance_records_school_idx on public.attendance_records (school_id, status);

select private.attach_updated_at('public.attendance_records');

create trigger attendance_records_same_school
  before insert or update on public.attendance_records
  for each row execute function public.check_same_school(
    'lesson_id', 'lessons',
    'student_id', 'students'
  );

-- -----------------------------------------------------------------------------
-- Justificatifs d'absence
-- -----------------------------------------------------------------------------
create table public.absence_justifications (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  reason        text not null,
  document_path text,
  status        public.justification_status not null default 'pending',
  submitted_by  uuid references public.profiles(id) on delete set null,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint absence_justifications_date_order check (end_date >= start_date)
);

create index absence_justifications_student_idx
  on public.absence_justifications (student_id, start_date desc);

select private.attach_updated_at('public.absence_justifications');

-- Approuver un justificatif requalifie les absences de la periode couverte :
-- sans cela, la validation resterait un acte purement declaratif.
create or replace function public.apply_justification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.attendance_records a
       set status = 'excused'
      from public.lessons l
     where a.lesson_id = l.id
       and a.student_id = new.student_id
       and a.status in ('absent', 'late')
       and l.date between new.start_date and new.end_date;

    new.reviewed_at := now();
    new.reviewed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger absence_justifications_apply
  before update on public.absence_justifications
  for each row execute function public.apply_justification();

-- -----------------------------------------------------------------------------
-- Saisie rapide : cree la feuille d'appel d'une seance, tous presents par
-- defaut. L'enseignant ne corrige alors que les exceptions.
-- -----------------------------------------------------------------------------
create or replace function public.open_attendance_sheet(p_lesson_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_class  uuid;
  v_count  integer := 0;
begin
  select school_id, class_id into v_school, v_class
  from public.lessons where id = p_lesson_id;

  if v_school is null then
    raise exception 'Seance introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_member(v_school) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  insert into public.attendance_records (school_id, lesson_id, student_id, status, recorded_by)
  select v_school, p_lesson_id, e.student_id, 'present', (select auth.uid())
  from public.enrollments e
  where e.class_id = v_class and e.status = 'active'
  on conflict (lesson_id, student_id) do nothing;

  get diagnostics v_count = row_count;

  update public.lessons set status = 'held' where id = p_lesson_id and status = 'planned';

  return v_count;
end;
$$;

grant execute on function public.open_attendance_sheet(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Statistiques
-- -----------------------------------------------------------------------------
create view public.attendance_stats
with (security_invoker = true) as
  select a.school_id,
         a.student_id,
         l.class_id,
         count(*)                                                       as total_records,
         count(*) filter (where a.status = 'present')                   as present_count,
         count(*) filter (where a.status = 'absent')                    as absent_count,
         count(*) filter (where a.status = 'excused')                   as excused_count,
         count(*) filter (where a.status = 'late')                      as late_count,
         round(
           100.0 * count(*) filter (where a.status in ('present', 'late', 'left_early'))
           / nullif(count(*), 0)
         , 1)                                                           as attendance_rate,
         max(l.date) filter (where a.status = 'absent')                 as last_absence
  from public.attendance_records a
  join public.lessons l on l.id = a.lesson_id
  group by a.school_id, a.student_id, l.class_id;

grant select on public.attendance_stats to authenticated;

-- Assiduite par seance, pour le suivi quotidien de la vie scolaire.
create view public.lesson_attendance
with (security_invoker = true) as
  select l.id as lesson_id,
         l.school_id,
         l.class_id,
         l.date,
         l.start_time,
         l.status as lesson_status,
         s.name as subject_name,
         t.full_name as teacher_name,
         c.name as class_name,
         count(a.id)                                       as recorded_count,
         count(a.id) filter (where a.status = 'absent')    as absent_count,
         count(a.id) filter (where a.status = 'late')      as late_count,
         (count(a.id) > 0)                                 as is_taken
  from public.lessons l
  join public.classes c on c.id = l.class_id
  left join public.subjects s on s.id = l.subject_id
  left join public.teachers t on t.id = l.teacher_id
  left join public.attendance_records a on a.lesson_id = l.id
  group by l.id, l.school_id, l.class_id, l.date, l.start_time, l.status,
           s.name, t.full_name, c.name;

grant select on public.lesson_attendance to authenticated;

-- Eleves depassant un seuil d'absences non justifiees, pour declencher alerte
-- et courrier aux familles.
create or replace function public.absenteeism_alerts(
  p_school_id uuid,
  p_threshold integer default 5,
  p_since     date default null
)
returns table (
  student_id     uuid,
  full_name      text,
  matricule      text,
  class_name     text,
  absent_count   bigint,
  attendance_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select st.id,
         st.full_name,
         st.matricule,
         c.name,
         count(*) filter (where a.status = 'absent'),
         round(
           100.0 * count(*) filter (where a.status in ('present', 'late', 'left_early'))
           / nullif(count(*), 0)
         , 1)
  from public.attendance_records a
  join public.lessons l on l.id = a.lesson_id
  join public.students st on st.id = a.student_id
  join public.classes c on c.id = l.class_id
  where a.school_id = p_school_id
    and private.is_school_member(p_school_id)
    and (p_since is null or l.date >= p_since)
  group by st.id, st.full_name, st.matricule, c.name
  having count(*) filter (where a.status = 'absent') >= p_threshold
  order by count(*) filter (where a.status = 'absent') desc
$$;

grant execute on function public.absenteeism_alerts(uuid, integer, date) to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.attendance_records enable row level security;

create policy attendance_records_select on public.attendance_records
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.my_student_ids())
    or student_id = any (private.taught_student_ids())
  );

-- L'enseignant fait l'appel de ses propres seances.
create policy attendance_records_write_teacher on public.attendance_records
  for all to authenticated
  using (
    lesson_id in (
      select l.id from public.lessons l
      join public.teachers t
        on t.id = l.teacher_id or t.id = l.substitute_teacher_id
      where t.profile_id = (select auth.uid())
    )
  )
  with check (
    lesson_id in (
      select l.id from public.lessons l
      join public.teachers t
        on t.id = l.teacher_id or t.id = l.substitute_teacher_id
      where t.profile_id = (select auth.uid())
    )
  );

create policy attendance_records_write_admin on public.attendance_records
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.attendance_records');

alter table public.absence_justifications enable row level security;

create policy absence_justifications_select on public.absence_justifications
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.my_student_ids())
  );

-- Le parent depose un justificatif ; seule l'administration l'approuve.
create policy absence_justifications_insert on public.absence_justifications
  for insert to authenticated
  with check (
    private.is_school_admin(school_id)
    or student_id = any (private.my_student_ids())
  );

create policy absence_justifications_write on public.absence_justifications
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.absence_justifications');
