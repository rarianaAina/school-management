-- =============================================================================
-- 0014 — Emplois du temps
--
-- Deux niveaux volontairement distincts :
--   timetable_slots — la grille hebdomadaire recurrente (le modele)
--   lessons         — la seance datee, instance d'un creneau (le reel)
--
-- Sans cette separation, impossible d'annuler un cours, de le deplacer
-- exceptionnellement, d'y placer un remplacant ni d'y rattacher une feuille
-- d'appel : la presence se prend sur une seance, pas sur un creneau.
-- =============================================================================

create type public.lesson_status as enum ('planned', 'held', 'cancelled', 'replaced');

-- -----------------------------------------------------------------------------
-- timetable_slots
--
-- class_id est denormalise depuis class_subject_id : une contrainte EXCLUDE ne
-- peut pas joindre une autre table, et il faut pouvoir interdire deux cours
-- simultanes pour une meme classe. Un trigger garantit la coherence.
--
-- Pas de term_id ni de plage de validite : la grille vaut pour l'annee. Les
-- rendre facultatifs ferait entrer des NULL dans la cle d'exclusion, ou
-- NULL = NULL ne vaut pas vrai — la detection de conflits deviendrait muette
-- precisement dans le cas par defaut. Un changement de grille en cours d'annee
-- se fait en editant les creneaux.
-- -----------------------------------------------------------------------------
create table public.timetable_slots (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  class_subject_id  uuid not null references public.class_subjects(id) on delete cascade,
  class_id          uuid not null references public.classes(id) on delete cascade,
  teacher_id        uuid references public.teachers(id) on delete set null,
  room_id           uuid references public.rooms(id) on delete set null,
  day_of_week       smallint not null,
  start_time        time not null,
  end_time          time not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint timetable_slots_day_range check (day_of_week between 1 and 7),
  constraint timetable_slots_time_order check (end_time > start_time)
);

create index timetable_slots_class_idx on public.timetable_slots (class_id, day_of_week, start_time);
create index timetable_slots_teacher_idx on public.timetable_slots (teacher_id, day_of_week, start_time);
create index timetable_slots_room_idx on public.timetable_slots (room_id, day_of_week, start_time);
create index timetable_slots_year_idx on public.timetable_slots (school_id, academic_year_id);

select private.attach_updated_at('public.timetable_slots');

-- -----------------------------------------------------------------------------
-- Detection de conflits par le moteur, pas par du code applicatif.
--
-- Trois impossibilites : une salle occupee deux fois, un enseignant devant deux
-- classes, une classe avec deux cours au meme moment. Toute tentative leve un
-- 23P01 (exclusion_violation), que le front traduit en message lisible.
-- -----------------------------------------------------------------------------
alter table public.timetable_slots
  add constraint timetable_slots_no_room_overlap
  exclude using gist (
    room_id with =,
    day_of_week with =,
    academic_year_id with =,
    (public.timerange(start_time, end_time)) with &&
  ) where (room_id is not null);

alter table public.timetable_slots
  add constraint timetable_slots_no_teacher_overlap
  exclude using gist (
    teacher_id with =,
    day_of_week with =,
    academic_year_id with =,
    (public.timerange(start_time, end_time)) with &&
  ) where (teacher_id is not null);

alter table public.timetable_slots
  add constraint timetable_slots_no_class_overlap
  exclude using gist (
    class_id with =,
    day_of_week with =,
    academic_year_id with =,
    (public.timerange(start_time, end_time)) with &&
  );

-- class_id et school_id suivent class_subject_id ; l'annee suit la classe.
create or replace function public.sync_timetable_slot_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class  uuid;
  v_school uuid;
  v_year   uuid;
begin
  select cs.class_id, cs.school_id into v_class, v_school
  from public.class_subjects cs
  where cs.id = new.class_subject_id;

  if v_class is null then
    raise exception 'Matiere de classe introuvable.' using errcode = '23503';
  end if;

  select c.academic_year_id into v_year from public.classes c where c.id = v_class;

  new.class_id        := v_class;
  new.school_id       := v_school;
  new.academic_year_id := v_year;

  return new;
end;
$$;

create trigger timetable_slots_sync_refs
  before insert or update of class_subject_id on public.timetable_slots
  for each row execute function public.sync_timetable_slot_refs();

create trigger timetable_slots_same_school
  before insert or update on public.timetable_slots
  for each row execute function public.check_same_school(
    'teacher_id', 'teachers',
    'room_id', 'rooms'
  );

-- -----------------------------------------------------------------------------
-- lessons — seances datees
-- -----------------------------------------------------------------------------
create table public.lessons (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references public.schools(id) on delete cascade,
  timetable_slot_id     uuid references public.timetable_slots(id) on delete set null,
  class_id              uuid not null references public.classes(id) on delete cascade,
  class_subject_id      uuid references public.class_subjects(id) on delete set null,
  subject_id            uuid references public.subjects(id) on delete set null,
  teacher_id            uuid references public.teachers(id) on delete set null,
  substitute_teacher_id uuid references public.teachers(id) on delete set null,
  room_id               uuid references public.rooms(id) on delete set null,
  date                  date not null,
  start_time            time not null,
  end_time              time not null,
  status                public.lesson_status not null default 'planned',
  topic                 text,
  homework              text,
  cancellation_reason   text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint lessons_time_order check (end_time > start_time)
);

create index lessons_class_date_idx on public.lessons (class_id, date);
create index lessons_teacher_date_idx on public.lessons (teacher_id, date);
create index lessons_school_date_idx on public.lessons (school_id, date);

-- Une seance par creneau et par date : la regeneration reste sans effet de bord.
create unique index lessons_slot_date_unique
  on public.lessons (timetable_slot_id, date)
  where timetable_slot_id is not null;

select private.attach_updated_at('public.lessons');

-- -----------------------------------------------------------------------------
-- generate_lessons — deplie la grille hebdomadaire sur une periode.
--
-- Exclut les jours couverts par school_calendar (vacances, fermetures) : une
-- seance generee un jour ferie fausserait le taux d'assiduite.
-- -----------------------------------------------------------------------------
create or replace function public.generate_lessons(
  p_class_id uuid,
  p_from     date,
  p_to       date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_year   uuid;
  v_count  integer := 0;
begin
  select school_id, academic_year_id into v_school, v_year
  from public.classes where id = p_class_id;

  if v_school is null then
    raise exception 'Classe introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school) then
    raise exception 'Seule l''administration peut generer les seances.' using errcode = '42501';
  end if;

  if p_to < p_from then
    raise exception 'Periode invalide.' using errcode = '22007';
  end if;

  insert into public.lessons (
    school_id, timetable_slot_id, class_id, class_subject_id, subject_id,
    teacher_id, room_id, date, start_time, end_time
  )
  select v_school,
         s.id,
         s.class_id,
         s.class_subject_id,
         cs.subject_id,
         s.teacher_id,
         s.room_id,
         d::date,
         s.start_time,
         s.end_time
  from public.timetable_slots s
  join public.class_subjects cs on cs.id = s.class_subject_id
  cross join generate_series(p_from, p_to, interval '1 day') as d
  where s.class_id = p_class_id
    and extract(isodow from d) = s.day_of_week
    and not exists (
      select 1 from public.school_calendar sc
      where sc.academic_year_id = v_year
        and sc.type in ('holiday', 'closure')
        and d::date between sc.start_date and sc.end_date
    )
  -- Le predicat doit etre repete : sans lui, Postgres ne reconnait pas l'index
  -- partiel lessons_slot_date_unique comme cible du ON CONFLICT.
  on conflict (timetable_slot_id, date) where timetable_slot_id is not null
  do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.generate_lessons(uuid, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Vue de consultation : la grille avec ses libelles.
-- security_invoker : chacun y voit ce que la RLS de timetable_slots lui accorde.
-- -----------------------------------------------------------------------------
create view public.timetable_view
with (security_invoker = true) as
  select s.id,
         s.school_id,
         s.academic_year_id,
         s.class_subject_id,
         s.class_id,
         s.teacher_id,
         s.room_id,
         s.day_of_week,
         s.start_time,
         s.end_time,
         c.name       as class_name,
         l.name       as level_name,
         sub.id       as subject_id,
         sub.name     as subject_name,
         sub.code     as subject_code,
         sub.color    as subject_color,
         t.full_name  as teacher_name,
         r.name       as room_name,
         cs.coefficient,
         cs.weekly_hours
  from public.timetable_slots s
  join public.class_subjects cs on cs.id = s.class_subject_id
  join public.subjects sub on sub.id = cs.subject_id
  join public.classes c on c.id = s.class_id
  join public.levels l on l.id = c.level_id
  left join public.teachers t on t.id = s.teacher_id
  left join public.rooms r on r.id = s.room_id;

grant select on public.timetable_view to authenticated;

comment on view public.timetable_view is
  'Grille hebdomadaire avec libelles de classe, matiere, enseignant et salle.';

-- Volume horaire hebdomadaire place, par enseignant : sert au controle de charge.
create view public.teacher_workload
with (security_invoker = true) as
  select s.school_id,
         s.academic_year_id,
         s.teacher_id,
         count(*)                                                              as slot_count,
         sum(extract(epoch from (s.end_time - s.start_time)) / 3600)::numeric(6,2) as weekly_hours,
         count(distinct s.class_id)                                            as class_count
  from public.timetable_slots s
  where s.teacher_id is not null
  group by s.school_id, s.academic_year_id, s.teacher_id;

grant select on public.teacher_workload to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.timetable_slots enable row level security;

create policy timetable_slots_select on public.timetable_slots
  for select to authenticated
  using (private.is_school_member(school_id));

create policy timetable_slots_write on public.timetable_slots
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.timetable_slots');

alter table public.lessons enable row level security;

create policy lessons_select on public.lessons
  for select to authenticated
  using (private.is_school_member(school_id));

create policy lessons_write on public.lessons
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

-- L'enseignant renseigne le contenu de ses propres seances : sujet traite,
-- devoirs, tenue effective ou annulation.
create policy lessons_update_own on public.lessons
  for update to authenticated
  using (
    teacher_id in (
      select t.id from public.teachers t
      where t.profile_id = (select auth.uid()) and t.deleted_at is null
    )
    or substitute_teacher_id in (
      select t.id from public.teachers t
      where t.profile_id = (select auth.uid()) and t.deleted_at is null
    )
  )
  with check (
    teacher_id in (
      select t.id from public.teachers t
      where t.profile_id = (select auth.uid()) and t.deleted_at is null
    )
    or substitute_teacher_id in (
      select t.id from public.teachers t
      where t.profile_id = (select auth.uid()) and t.deleted_at is null
    )
  );

select private.grant_crud('public.lessons');

-- L'enseignant ne deplace pas une seance ni ne change de classe : il en decrit
-- le deroulement. Le reste releve de l'administration.
create or replace function public.guard_lesson_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_school_admin(new.school_id) then
    return new;
  end if;

  if new.date              is distinct from old.date
     or new.start_time     is distinct from old.start_time
     or new.end_time       is distinct from old.end_time
     or new.class_id       is distinct from old.class_id
     or new.teacher_id     is distinct from old.teacher_id
     or new.room_id        is distinct from old.room_id
     or new.class_subject_id is distinct from old.class_subject_id then
    raise exception 'Seule l''administration peut deplacer ou reaffecter une seance.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger lessons_guard_fields
  before update on public.lessons
  for each row execute function public.guard_lesson_fields();
