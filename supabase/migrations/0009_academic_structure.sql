-- =============================================================================
-- 0009 — Structure academique : niveaux, filieres, matieres, salles, classes
--
-- class_subjects est le pivot du domaine : coefficient, credits, bareme,
-- enseignant et volume horaire y sont reunis. Les evaluations (module Notes) et
-- les creneaux (module Emploi du temps) s'y rattachent tous les deux.
-- =============================================================================

create type public.school_cycle as enum (
  'preschool', 'primary', 'middle', 'high', 'higher'
);

create type public.room_type as enum (
  'classroom', 'lab', 'amphitheater', 'workshop', 'gym', 'library', 'other'
);

-- -----------------------------------------------------------------------------
-- levels — 6eme, Terminale, L1, M2...
-- -----------------------------------------------------------------------------
create table public.levels (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  name         text not null,
  code         text,
  cycle        public.school_cycle not null default 'high',
  order_index  smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint levels_unique_name unique (school_id, name)
);

create index levels_school_idx on public.levels (school_id, order_index);
select private.attach_updated_at('public.levels');

-- -----------------------------------------------------------------------------
-- programs — filieres, series, departements (Serie S, Genie Logiciel...)
-- -----------------------------------------------------------------------------
create table public.programs (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  name            text not null,
  code            text,
  level_id        uuid references public.levels(id) on delete set null,
  head_teacher_id uuid references public.teachers(id) on delete set null,
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint programs_unique_name unique (school_id, name)
);

create index programs_school_idx on public.programs (school_id) where is_active;
select private.attach_updated_at('public.programs');

-- -----------------------------------------------------------------------------
-- subjects — matieres
-- -----------------------------------------------------------------------------
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  code        text,
  category    text,
  color       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint subjects_unique_name unique (school_id, name)
);

create index subjects_school_idx on public.subjects (school_id) where is_active;
select private.attach_updated_at('public.subjects');

-- -----------------------------------------------------------------------------
-- subject_levels — modele de coefficients par niveau, repris a la creation
-- d'une classe. Evite de resaisir "Maths coef 7 en Terminale S" chaque annee.
-- -----------------------------------------------------------------------------
create table public.subject_levels (
  school_id             uuid not null references public.schools(id) on delete cascade,
  subject_id            uuid not null references public.subjects(id) on delete cascade,
  level_id              uuid not null references public.levels(id) on delete cascade,
  default_coefficient   numeric(4,2) not null default 1,
  default_credits       numeric(4,1),
  default_max_score     numeric(5,2) not null default 20,
  default_weekly_hours  numeric(4,1),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  primary key (subject_id, level_id),
  constraint subject_levels_coefficient_positive check (default_coefficient > 0),
  constraint subject_levels_max_score_positive check (default_max_score > 0)
);

create index subject_levels_school_idx on public.subject_levels (school_id);
select private.attach_updated_at('public.subject_levels');

-- -----------------------------------------------------------------------------
-- rooms — salles. capacity sert a la repartition des examens.
-- -----------------------------------------------------------------------------
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  code        text,
  building    text,
  floor       text,
  capacity    smallint,
  type        public.room_type not null default 'classroom',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint rooms_unique_name unique (school_id, name),
  constraint rooms_capacity_positive check (capacity is null or capacity > 0)
);

create index rooms_school_idx on public.rooms (school_id) where is_active;
select private.attach_updated_at('public.rooms');

-- -----------------------------------------------------------------------------
-- classes — un groupe d'eleves, pour une annee scolaire donnee
-- -----------------------------------------------------------------------------
create table public.classes (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  level_id          uuid not null references public.levels(id) on delete restrict,
  program_id        uuid references public.programs(id) on delete set null,
  name              text not null,
  code              text,
  capacity          smallint,
  main_teacher_id   uuid references public.teachers(id) on delete set null,
  default_room_id   uuid references public.rooms(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint classes_unique_name unique (school_id, academic_year_id, name),
  constraint classes_capacity_positive check (capacity is null or capacity > 0)
);

create index classes_year_idx on public.classes (school_id, academic_year_id);
create index classes_level_idx on public.classes (level_id);
create index classes_main_teacher_idx on public.classes (main_teacher_id)
  where main_teacher_id is not null;

select private.attach_updated_at('public.classes');

-- -----------------------------------------------------------------------------
-- class_subjects — pivot : matiere enseignee dans une classe
-- -----------------------------------------------------------------------------
create table public.class_subjects (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  class_id      uuid not null references public.classes(id) on delete cascade,
  subject_id    uuid not null references public.subjects(id) on delete restrict,
  teacher_id    uuid references public.teachers(id) on delete set null,
  coefficient   numeric(4,2) not null default 1,
  credits       numeric(4,1),          -- mode ECTS uniquement
  max_score     numeric(5,2) not null default 20,
  weekly_hours  numeric(4,1),
  is_optional   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint class_subjects_unique unique (class_id, subject_id),
  constraint class_subjects_coefficient_positive check (coefficient > 0),
  constraint class_subjects_max_score_positive check (max_score > 0),
  constraint class_subjects_credits_positive check (credits is null or credits > 0)
);

create index class_subjects_class_idx on public.class_subjects (class_id);
create index class_subjects_teacher_idx on public.class_subjects (teacher_id)
  where teacher_id is not null;

select private.attach_updated_at('public.class_subjects');

comment on table public.class_subjects is
  'Pivot academique : porte le coefficient, les credits, le bareme, l''enseignant et le volume horaire.';

-- -----------------------------------------------------------------------------
-- Coherence multi-tenant : une classe ne peut pas referencer le niveau, la
-- filiere ou la salle d'un autre etablissement. Les cles etrangeres seules ne
-- l'empechent pas.
-- -----------------------------------------------------------------------------
create or replace function public.check_same_school()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column text;
  v_table  text;
  v_id     uuid;
  v_school uuid;
  v_pairs  text[] := tg_argv;
  i        integer;
begin
  -- Arguments par paires : nom de colonne, table referencee.
  -- TG_ARGV est indexe a partir de 0 : parcourir par les bornes reelles du
  -- tableau, jamais en supposant 1.
  for i in array_lower(v_pairs, 1) .. array_upper(v_pairs, 1) by 2 loop
    v_column := v_pairs[i];
    v_table  := v_pairs[i + 1];

    execute format('select ($1).%I', v_column) into v_id using new;
    continue when v_id is null;

    execute format('select school_id from public.%I where id = $1', v_table)
      into v_school using v_id;

    if v_school is distinct from new.school_id then
      raise exception
        'Incoherence multi-etablissement : %.% renvoie vers un enregistrement d''un autre etablissement.',
        tg_table_name, v_column
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

create trigger classes_same_school
  before insert or update on public.classes
  for each row execute function public.check_same_school(
    'academic_year_id', 'academic_years',
    'level_id', 'levels',
    'program_id', 'programs',
    'main_teacher_id', 'teachers',
    'default_room_id', 'rooms'
  );

create trigger class_subjects_same_school
  before insert or update on public.class_subjects
  for each row execute function public.check_same_school(
    'class_id', 'classes',
    'subject_id', 'subjects',
    'teacher_id', 'teachers'
  );

create trigger programs_same_school
  before insert or update on public.programs
  for each row execute function public.check_same_school(
    'level_id', 'levels',
    'head_teacher_id', 'teachers'
  );

-- -----------------------------------------------------------------------------
-- Classes enseignees par l'utilisateur courant (professeur principal ou
-- intervenant). Utilise par les policies des modules Notes et Presences.
-- -----------------------------------------------------------------------------
create or replace function private.my_taught_class_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct c.id), array[]::uuid[])
  from public.classes c
  left join public.class_subjects cs on cs.class_id = c.id
  join public.teachers t
    on t.id = c.main_teacher_id or t.id = cs.teacher_id
  where t.profile_id = (select auth.uid())
    and t.deleted_at is null
$$;

grant execute on function private.my_taught_class_ids() to authenticated;

-- =============================================================================
-- RLS : lecture par tout membre (les eleves consultent leurs matieres et
-- leur classe), ecriture reservee a l'administration.
-- =============================================================================
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'levels', 'programs', 'subjects', 'subject_levels', 'rooms', 'classes', 'class_subjects'
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

-- L'enseignant ajuste le bareme et le volume horaire de ses propres matieres,
-- sans pouvoir changer le coefficient (qui releve de l'administration).
create policy class_subjects_update_own on public.class_subjects
  for update to authenticated
  using (
    teacher_id in (
      select t.id from public.teachers t
      where t.profile_id = (select auth.uid()) and t.deleted_at is null
    )
  )
  with check (
    teacher_id in (
      select t.id from public.teachers t
      where t.profile_id = (select auth.uid()) and t.deleted_at is null
    )
  );

create or replace function public.guard_class_subject_coefficient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.coefficient is distinct from old.coefficient
      or new.credits is distinct from old.credits)
     and not private.is_school_admin(new.school_id) then
    raise exception 'Seule l''administration peut modifier un coefficient ou des credits.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger class_subjects_guard_coefficient
  before update on public.class_subjects
  for each row execute function public.guard_class_subject_coefficient();
