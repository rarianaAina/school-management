-- =============================================================================
-- 0010 — Eleves, tuteurs, inscriptions
--
-- L'identite civile vit sur `students`, pas sur `profiles` : un eleve de
-- primaire n'a pas de compte. profile_id n'est renseigne que le jour ou un
-- acces personnel lui est ouvert.
-- =============================================================================

create type public.student_status as enum (
  'enrolled', 'graduated', 'transferred', 'withdrawn', 'suspended'
);

create type public.enrollment_status as enum (
  'active', 'transferred', 'withdrawn', 'repeating', 'completed'
);

create type public.guardian_relationship as enum (
  'father', 'mother', 'stepparent', 'grandparent', 'sibling', 'tutor', 'other'
);

-- -----------------------------------------------------------------------------
-- students
-- -----------------------------------------------------------------------------
create table public.students (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  profile_id     uuid references public.profiles(id) on delete set null,
  matricule      text not null,
  first_name     text not null,
  last_name      text not null,
  full_name      text generated always as (first_name || ' ' || last_name) stored,
  birth_date     date,
  birth_place    text,
  gender         text,
  nationality    text,
  photo_url      text,
  email          text,
  phone          text,
  address        text,
  city           text,
  blood_group    text,
  medical_notes  text,
  previous_school text,
  entry_date     date,
  exit_date      date,
  status         public.student_status not null default 'enrolled',
  notes          text,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint students_matricule_unique unique (school_id, matricule),
  constraint students_gender_values check (gender is null or gender in ('male', 'female', 'other')),
  constraint students_exit_after_entry check (exit_date is null or entry_date is null or exit_date >= entry_date)
);

create index students_school_idx on public.students (school_id) where deleted_at is null;
create index students_name_idx on public.students (school_id, lower(full_name));
create index students_matricule_idx on public.students (school_id, matricule);
create index students_profile_idx on public.students (profile_id) where profile_id is not null;
create index students_status_idx on public.students (school_id, status) where deleted_at is null;

select private.attach_updated_at('public.students');

-- Matricule attribue automatiquement : PREFIX-ANNEE-0001, sans trou ni collision.
create or replace function public.assign_matricule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.matricule is null or length(trim(new.matricule)) = 0 then
    new.matricule := public.next_number(new.school_id, 'matricule');
  end if;
  return new;
end;
$$;

create trigger students_assign_matricule
  before insert on public.students
  for each row execute function public.assign_matricule();

-- -----------------------------------------------------------------------------
-- guardians — parents et tuteurs legaux
-- -----------------------------------------------------------------------------
create table public.guardians (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  profile_id   uuid references public.profiles(id) on delete set null,
  first_name   text not null,
  last_name    text not null,
  full_name    text generated always as (first_name || ' ' || last_name) stored,
  email        text,
  phone        text,
  address      text,
  city         text,
  profession   text,
  national_id  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index guardians_school_idx on public.guardians (school_id);
create index guardians_name_idx on public.guardians (school_id, lower(full_name));
create index guardians_profile_idx on public.guardians (profile_id) where profile_id is not null;

select private.attach_updated_at('public.guardians');

-- -----------------------------------------------------------------------------
-- student_guardians — lien N..N, avec les droits de chaque tuteur
-- -----------------------------------------------------------------------------
create table public.student_guardians (
  school_id          uuid not null references public.schools(id) on delete cascade,
  student_id         uuid not null references public.students(id) on delete cascade,
  guardian_id        uuid not null references public.guardians(id) on delete cascade,
  relationship       public.guardian_relationship not null default 'other',
  is_primary         boolean not null default false,
  is_legal_guardian  boolean not null default true,
  receives_invoices  boolean not null default true,
  can_pick_up        boolean not null default true,
  created_at         timestamptz not null default now(),

  primary key (student_id, guardian_id)
);

create index student_guardians_guardian_idx on public.student_guardians (guardian_id);
create index student_guardians_school_idx on public.student_guardians (school_id);

-- Un seul contact principal par eleve : c'est lui qui recoit les convocations.
create unique index student_guardians_one_primary
  on public.student_guardians (student_id)
  where is_primary;

-- -----------------------------------------------------------------------------
-- enrollments — inscription d'un eleve dans une classe, pour une annee.
-- La table constitue l'historique scolaire.
-- -----------------------------------------------------------------------------
create table public.enrollments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  student_id         uuid not null references public.students(id) on delete cascade,
  class_id           uuid not null references public.classes(id) on delete cascade,
  academic_year_id   uuid not null references public.academic_years(id) on delete cascade,
  status             public.enrollment_status not null default 'active',
  is_repeating       boolean not null default false,
  enrolled_at        date not null default current_date,
  withdrawn_at       date,
  withdrawal_reason  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint enrollments_unique_per_class unique (student_id, class_id)
);

-- Un eleve n'a qu'une inscription active par annee scolaire.
create unique index enrollments_one_active_per_year
  on public.enrollments (student_id, academic_year_id)
  where status = 'active';

create index enrollments_class_idx on public.enrollments (class_id) where status = 'active';
create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_year_idx on public.enrollments (school_id, academic_year_id);

select private.attach_updated_at('public.enrollments');

create trigger enrollments_same_school
  before insert or update on public.enrollments
  for each row execute function public.check_same_school(
    'student_id', 'students',
    'class_id', 'classes',
    'academic_year_id', 'academic_years'
  );

create trigger student_guardians_same_school
  before insert or update on public.student_guardians
  for each row execute function public.check_same_school(
    'student_id', 'students',
    'guardian_id', 'guardians'
  );

-- L'annee de l'inscription doit etre celle de la classe : sinon un eleve
-- pourrait etre rattache a une classe de l'annee precedente.
create or replace function public.check_enrollment_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year uuid;
begin
  select academic_year_id into v_year from public.classes where id = new.class_id;

  if v_year is distinct from new.academic_year_id then
    raise exception 'La classe choisie appartient a une autre annee scolaire.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger enrollments_check_year
  before insert or update on public.enrollments
  for each row execute function public.check_enrollment_year();

-- -----------------------------------------------------------------------------
-- student_documents — pieces justificatives (Supabase Storage)
-- -----------------------------------------------------------------------------
create table public.student_documents (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  type          text not null default 'other',
  label         text not null,
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index student_documents_student_idx on public.student_documents (student_id);

-- =============================================================================
-- Fonctions d'aide RLS specifiques aux eleves
-- =============================================================================

-- Eleves rattaches a l'utilisateur : lui-meme, ou ses enfants via un tuteur.
create or replace function private.my_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct s.id), array[]::uuid[])
  from public.students s
  left join public.student_guardians sg on sg.student_id = s.id
  left join public.guardians g on g.id = sg.guardian_id
  where s.deleted_at is null
    and (
      s.profile_id = (select auth.uid())
      or g.profile_id = (select auth.uid())
    )
$$;

-- Eleves des classes ou l'utilisateur enseigne.
create or replace function private.taught_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct e.student_id), array[]::uuid[])
  from public.enrollments e
  where e.status = 'active'
    and e.class_id = any (private.my_taught_class_ids())
$$;

-- Tuteurs visibles : les siens, et ceux des eleves du perimetre.
create or replace function private.visible_guardian_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct g.id), array[]::uuid[])
  from public.guardians g
  left join public.student_guardians sg on sg.guardian_id = g.id
  where g.profile_id = (select auth.uid())
     or sg.student_id = any (private.my_student_ids())
     or sg.student_id = any (private.taught_student_ids())
$$;

grant execute on function
  private.my_student_ids(),
  private.taught_student_ids(),
  private.visible_guardian_ids()
to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================

-- students ---------------------------------------------------------------
alter table public.students enable row level security;

create policy students_select on public.students
  for select to authenticated
  using (
    private.is_school_staff(school_id)          -- administration + comptabilite
    or id = any (private.my_student_ids())      -- soi-meme, ou son enfant
    or id = any (private.taught_student_ids())  -- ses eleves
  );

create policy students_write on public.students
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.students');

-- guardians --------------------------------------------------------------
alter table public.guardians enable row level security;

create policy guardians_select on public.guardians
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or id = any (private.visible_guardian_ids())
  );

create policy guardians_write on public.guardians
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

-- Le tuteur tient ses propres coordonnees a jour.
create policy guardians_update_self on public.guardians
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

select private.grant_crud('public.guardians');

-- student_guardians ------------------------------------------------------
alter table public.student_guardians enable row level security;

create policy student_guardians_select on public.student_guardians
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.my_student_ids())
    or student_id = any (private.taught_student_ids())
  );

create policy student_guardians_write on public.student_guardians
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.student_guardians');

-- enrollments ------------------------------------------------------------
alter table public.enrollments enable row level security;

create policy enrollments_select on public.enrollments
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.my_student_ids())
    or class_id = any (private.my_taught_class_ids())
  );

create policy enrollments_write on public.enrollments
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.enrollments');

-- student_documents ------------------------------------------------------
alter table public.student_documents enable row level security;

create policy student_documents_select on public.student_documents
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.my_student_ids())
  );

create policy student_documents_write on public.student_documents
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.student_documents');

-- Audit des donnees sensibles
select private.attach_audit('public.students');
select private.attach_audit('public.enrollments');
