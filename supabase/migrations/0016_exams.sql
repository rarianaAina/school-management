-- =============================================================================
-- 0016 — Examens : sessions, epreuves, convocations, resultats, deliberations
--
-- Distinct du module Notes : une epreuve d'examen se planifie (salles,
-- surveillants, convocations numerotees) et se delibere en jury. Les resultats
-- peuvent etre reportes dans grades pour entrer dans les moyennes.
-- =============================================================================

create type public.exam_session_type as enum ('regular', 'resit', 'entrance', 'final', 'mock');

create type public.exam_session_status as enum (
  'draft', 'scheduled', 'ongoing', 'graded', 'deliberated', 'closed'
);

create type public.exam_decision as enum (
  'admitted', 'failed', 'resit', 'deferred', 'excluded'
);

create type public.registration_status as enum ('registered', 'absent', 'excluded');

create type public.supervisor_role as enum ('invigilator', 'chief', 'floater');

-- -----------------------------------------------------------------------------
-- Sessions
-- -----------------------------------------------------------------------------
create table public.exam_sessions (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  term_id           uuid references public.terms(id) on delete set null,
  name              text not null,
  type              public.exam_session_type not null default 'regular',
  start_date        date not null,
  end_date          date not null,
  status            public.exam_session_status not null default 'draft',
  instructions      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint exam_sessions_date_order check (end_date >= start_date)
);

create index exam_sessions_year_idx on public.exam_sessions (school_id, academic_year_id);
select private.attach_updated_at('public.exam_sessions');

-- -----------------------------------------------------------------------------
-- Epreuves
-- -----------------------------------------------------------------------------
create table public.exams (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  exam_session_id   uuid not null references public.exam_sessions(id) on delete cascade,
  subject_id        uuid not null references public.subjects(id) on delete restrict,
  level_id          uuid references public.levels(id) on delete set null,
  class_id          uuid references public.classes(id) on delete cascade,
  date              date not null,
  start_time        time not null,
  duration_minutes  smallint not null default 120,
  max_score         numeric(5,2) not null default 20,
  coefficient       numeric(4,2) not null default 1,
  instructions      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint exams_duration_positive check (duration_minutes > 0),
  constraint exams_max_score_positive check (max_score > 0)
);

create index exams_session_idx on public.exams (exam_session_id, date, start_time);
select private.attach_updated_at('public.exams');

-- Un enseignant ne peut pas surveiller deux epreuves simultanees, ni une salle
-- accueillir deux epreuves : meme principe que l'emploi du temps, applique aux
-- dates reelles cette fois.
create table public.exam_rooms (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  exam_id    uuid not null references public.exams(id) on delete cascade,
  room_id    uuid not null references public.rooms(id) on delete restrict,
  capacity   smallint,

  constraint exam_rooms_unique unique (exam_id, room_id)
);

create table public.exam_supervisors (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  exam_room_id uuid not null references public.exam_rooms(id) on delete cascade,
  teacher_id   uuid not null references public.teachers(id) on delete cascade,
  role         public.supervisor_role not null default 'invigilator',

  constraint exam_supervisors_unique unique (exam_room_id, teacher_id)
);

-- -----------------------------------------------------------------------------
-- Convocations
-- -----------------------------------------------------------------------------
create table public.exam_registrations (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  exam_session_id     uuid not null references public.exam_sessions(id) on delete cascade,
  student_id          uuid not null references public.students(id) on delete cascade,
  exam_room_id        uuid references public.exam_rooms(id) on delete set null,
  seat_number         integer,
  convocation_number  text,
  convocation_pdf_path text,
  status              public.registration_status not null default 'registered',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint exam_registrations_unique unique (exam_session_id, student_id)
);

create index exam_registrations_session_idx on public.exam_registrations (exam_session_id);
select private.attach_updated_at('public.exam_registrations');

-- -----------------------------------------------------------------------------
-- Resultats
-- -----------------------------------------------------------------------------
create table public.exam_results (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  exam_id         uuid not null references public.exams(id) on delete cascade,
  student_id      uuid not null references public.students(id) on delete cascade,
  score           numeric(5,2),
  is_absent       boolean not null default false,
  is_disqualified boolean not null default false,
  remark          text,
  graded_by       uuid references public.profiles(id) on delete set null,
  graded_at       timestamptz not null default now(),

  constraint exam_results_unique unique (exam_id, student_id),
  constraint exam_results_score_positive check (score is null or score >= 0)
);

create index exam_results_exam_idx on public.exam_results (exam_id);
create index exam_results_student_idx on public.exam_results (student_id);

-- -----------------------------------------------------------------------------
-- Deliberations
-- -----------------------------------------------------------------------------
create table public.deliberations (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  exam_session_id   uuid not null references public.exam_sessions(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  computed_average  numeric(5,2),
  computed_decision public.exam_decision,
  decision          public.exam_decision,
  credits_earned    numeric(5,1),
  credits_required  numeric(5,1),
  resit_subject_ids uuid[] not null default '{}',
  jury_comment      text,
  decided_by        uuid references public.profiles(id) on delete set null,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint deliberations_unique unique (exam_session_id, student_id)
);

select private.attach_updated_at('public.deliberations');

comment on column public.deliberations.computed_decision is
  'Decision calculee automatiquement. `decision` porte l''arbitrage du jury : la valeur d''origine reste visible et l''ecart est journalise.';

-- -----------------------------------------------------------------------------
-- Releves officiels
-- -----------------------------------------------------------------------------
create table public.transcripts (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  exam_session_id   uuid references public.exam_sessions(id) on delete set null,
  serial_number     text not null,
  pdf_path          text,
  issued_by         uuid references public.profiles(id) on delete set null,
  issued_at         timestamptz not null default now(),

  constraint transcripts_serial_unique unique (school_id, serial_number)
);

create index transcripts_student_idx on public.transcripts (student_id);

-- =============================================================================
-- Fonctions
-- =============================================================================

-- Inscrit une classe entiere a une session et attribue place et numero de
-- convocation. La repartition suit la capacite declaree de chaque salle.
create or replace function public.register_class_for_session(
  p_session_id uuid,
  p_class_id   uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_count  integer := 0;
  v_row    record;
begin
  select school_id into v_school from public.exam_sessions where id = p_session_id;

  if v_school is null then
    raise exception 'Session introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school) then
    raise exception 'Seule l''administration peut convoquer.' using errcode = '42501';
  end if;

  for v_row in
    select e.student_id
    from public.enrollments e
    where e.class_id = p_class_id and e.status = 'active'
    order by (select s.last_name from public.students s where s.id = e.student_id)
  loop
    insert into public.exam_registrations (
      school_id, exam_session_id, student_id, convocation_number
    )
    values (
      v_school, p_session_id, v_row.student_id,
      public.next_number(v_school, 'convocation')
    )
    on conflict (exam_session_id, student_id) do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.register_class_for_session(uuid, uuid) to authenticated;

-- Repartit les convives d'une session dans les salles d'une epreuve, en
-- respectant les capacites, et numerote les places.
create or replace function public.assign_exam_seats(p_exam_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school  uuid;
  v_session uuid;
  v_room    record;
  v_reg     record;
  v_seat    integer;
  v_total   integer := 0;
begin
  select school_id, exam_session_id into v_school, v_session
  from public.exams where id = p_exam_id;

  if v_school is null then
    raise exception 'Epreuve introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  for v_room in
    select er.id,
           coalesce(er.capacity, r.capacity, 30) as capacity
    from public.exam_rooms er
    join public.rooms r on r.id = er.room_id
    where er.exam_id = p_exam_id
    order by r.name
  loop
    v_seat := 0;

    for v_reg in
      select reg.id
      from public.exam_registrations reg
      join public.students s on s.id = reg.student_id
      where reg.exam_session_id = v_session
        and reg.exam_room_id is null
        and reg.status = 'registered'
      order by s.last_name, s.first_name
      limit v_room.capacity
    loop
      v_seat := v_seat + 1;
      update public.exam_registrations
         set exam_room_id = v_room.id, seat_number = v_seat
       where id = v_reg.id;
      v_total := v_total + 1;
    end loop;
  end loop;

  return v_total;
end;
$$;

grant execute on function public.assign_exam_seats(uuid) to authenticated;

-- Reporte les resultats d'une epreuve dans les notes, pour qu'ils entrent dans
-- les moyennes de periode. Cree l'evaluation correspondante si besoin.
create or replace function public.push_exam_to_grades(p_exam_id uuid, p_term_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school     uuid;
  v_subject    uuid;
  v_class      uuid;
  v_max        numeric;
  v_coef       numeric;
  v_date       date;
  v_cs         uuid;
  v_assessment uuid;
  v_count      integer := 0;
begin
  select school_id, subject_id, class_id, max_score, coefficient, date
    into v_school, v_subject, v_class, v_max, v_coef, v_date
  from public.exams where id = p_exam_id;

  if v_school is null then
    raise exception 'Epreuve introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  if v_class is null then
    raise exception 'Cette epreuve n''est pas rattachee a une classe : report impossible.'
      using errcode = '23502';
  end if;

  select id into v_cs from public.class_subjects
   where class_id = v_class and subject_id = v_subject;

  if v_cs is null then
    raise exception 'La matiere de l''epreuve n''est pas enseignee dans cette classe.'
      using errcode = '23503';
  end if;

  insert into public.assessments (school_id, class_subject_id, term_id, title, date,
                                  max_score, weight, is_published)
  values (v_school, v_cs, p_term_id, 'Examen — report automatique', v_date, v_max, v_coef, true)
  returning id into v_assessment;

  insert into public.grades (school_id, assessment_id, student_id, score, is_absent)
  select v_school, v_assessment, er.student_id, er.score, er.is_absent
  from public.exam_results er
  where er.exam_id = p_exam_id
  on conflict (assessment_id, student_id) do update
    set score = excluded.score, is_absent = excluded.is_absent;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.push_exam_to_grades(uuid, uuid) to authenticated;

-- Calcule moyennes et decisions d'une session, sans les arreter : le jury
-- garde la main via deliberations.decision.
create or replace function public.compute_deliberations(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school  uuid;
  v_passing numeric;
  v_count   integer := 0;
begin
  select school_id into v_school from public.exam_sessions where id = p_session_id;

  if not private.is_school_admin(v_school) then
    raise exception 'Seule l''administration peut lancer une deliberation.' using errcode = '42501';
  end if;

  select coalesce((s.settings #>> '{grading,passing_score}')::numeric, 10)
    into v_passing
  from public.schools s where s.id = v_school;

  insert into public.deliberations (
    school_id, exam_session_id, student_id, computed_average,
    computed_decision, decision, resit_subject_ids
  )
  select v_school,
         p_session_id,
         r.student_id,
         r.average,
         r.decision,
         r.decision,
         r.failed_subjects
  from (
    select er.student_id,
           round(
             sum(
               case when er.is_absent or er.is_disqualified then 0
                    else er.score / e.max_score * 20 end * e.coefficient
             ) / nullif(sum(e.coefficient), 0)
           , 2) as average,
           case
             when bool_or(er.is_disqualified) then 'excluded'::public.exam_decision
             when round(
                    sum(
                      case when er.is_absent or er.is_disqualified then 0
                           else er.score / e.max_score * 20 end * e.coefficient
                    ) / nullif(sum(e.coefficient), 0)
                  , 2) >= v_passing then 'admitted'::public.exam_decision
             when round(
                    sum(
                      case when er.is_absent or er.is_disqualified then 0
                           else er.score / e.max_score * 20 end * e.coefficient
                    ) / nullif(sum(e.coefficient), 0)
                  , 2) >= v_passing - 3 then 'resit'::public.exam_decision
             else 'failed'::public.exam_decision
           end as decision,
           coalesce(
             array_agg(e.subject_id) filter (
               where not er.is_absent and er.score / e.max_score * 20 < v_passing
             ),
             '{}'
           ) as failed_subjects
    from public.exam_results er
    join public.exams e on e.id = er.exam_id
    where e.exam_session_id = p_session_id
    group by er.student_id
  ) r
  on conflict (exam_session_id, student_id) do update
    set computed_average  = excluded.computed_average,
        computed_decision = excluded.computed_decision,
        resit_subject_ids = excluded.resit_subject_ids;

  get diagnostics v_count = row_count;

  update public.exam_sessions set status = 'deliberated' where id = p_session_id;

  return v_count;
end;
$$;

grant execute on function public.compute_deliberations(uuid) to authenticated;

-- Vue de suivi d'une session
create view public.exam_session_overview
with (security_invoker = true) as
  select s.id,
         s.school_id,
         s.academic_year_id,
         s.name,
         s.type,
         s.status,
         s.start_date,
         s.end_date,
         (select count(*) from public.exams e where e.exam_session_id = s.id) as exam_count,
         (select count(*) from public.exam_registrations r where r.exam_session_id = s.id)
           as registered_count,
         (select count(*) from public.deliberations d
           where d.exam_session_id = s.id and d.decision = 'admitted') as admitted_count,
         (select count(*) from public.deliberations d where d.exam_session_id = s.id)
           as deliberated_count
  from public.exam_sessions s;

grant select on public.exam_session_overview to authenticated;

-- =============================================================================
-- RLS — lecture par les membres, ecriture par l'administration ;
-- l'enseignant saisit les resultats des epreuves de ses matieres.
-- =============================================================================
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'exam_sessions', 'exams', 'exam_rooms', 'exam_supervisors', 'deliberations', 'transcripts'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (private.is_school_member(school_id))',
      v_table || '_select', v_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (private.is_school_admin(school_id))
         with check (private.is_school_admin(school_id))',
      v_table || '_write', v_table
    );
    execute format('select private.grant_crud(''public.%I'')', v_table);
  end loop;
end
$$;

-- Convocations : l'eleve et son parent voient la sienne.
alter table public.exam_registrations enable row level security;

create policy exam_registrations_select on public.exam_registrations
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.my_student_ids())
  );

create policy exam_registrations_write on public.exam_registrations
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.exam_registrations');

-- Resultats : administration, enseignant de la matiere, et l'eleve concerne
-- une fois la session deliberee.
alter table public.exam_results enable row level security;

create policy exam_results_select on public.exam_results
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or exam_id in (
      select e.id from public.exams e
      join public.class_subjects cs on cs.subject_id = e.subject_id and cs.class_id = e.class_id
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
    or (student_id = any (private.my_student_ids())
        and exam_id in (
          select e.id from public.exams e
          join public.exam_sessions s on s.id = e.exam_session_id
          where s.status in ('deliberated', 'closed')
        ))
  );

create policy exam_results_write_teacher on public.exam_results
  for all to authenticated
  using (
    exam_id in (
      select e.id from public.exams e
      join public.class_subjects cs on cs.subject_id = e.subject_id and cs.class_id = e.class_id
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  )
  with check (
    exam_id in (
      select e.id from public.exams e
      join public.class_subjects cs on cs.subject_id = e.subject_id and cs.class_id = e.class_id
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  );

create policy exam_results_write_admin on public.exam_results
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.exam_results');
select private.attach_audit('public.exam_results');
select private.attach_audit('public.deliberations');
