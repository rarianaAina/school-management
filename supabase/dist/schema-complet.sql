-- Schema complet — concatenation de supabase/migrations/*.sql

-- >>> 0001_extensions_and_types.sql
-- =============================================================================
-- 0001 — Extensions, types de base et utilitaires transverses
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
-- btree_gist : indispensable aux contraintes EXCLUDE de detection de conflits
-- d'horaires (module Emplois du temps).
create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Schema prive : fonctions d'aide RLS, jamais expose via PostgREST.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Type intervalle horaire (Postgres ne fournit pas de range natif sur `time`).
-- Utilise par les contraintes EXCLUDE des emplois du temps.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'timerange') then
    create type public.timerange as range (subtype = time);
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Enumerations transverses
-- -----------------------------------------------------------------------------
create type public.school_type as enum (
  'preschool',      -- maternelle
  'primary',        -- ecole primaire
  'middle_school',  -- college
  'high_school',    -- lycee
  'vocational',     -- centre de formation professionnelle
  'university',     -- universite / grande ecole
  'other'
);

create type public.user_role as enum (
  'super_admin',    -- gere un ou plusieurs etablissements
  'school_admin',   -- administration d'un etablissement
  'teacher',
  'student',
  'parent',
  'accountant'
);

create type public.term_kind as enum ('trimester', 'semester', 'quarter', 'year');

create type public.calendar_event_type as enum ('holiday', 'exam_period', 'closure', 'event');

-- -----------------------------------------------------------------------------
-- updated_at automatique
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Trigger BEFORE UPDATE : maintient la colonne updated_at.';

-- -----------------------------------------------------------------------------
-- Raccourci : pose le trigger updated_at sur une table
-- -----------------------------------------------------------------------------
create or replace function private.attach_updated_at(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create or replace trigger set_updated_at before update on %s
       for each row execute function public.set_updated_at()',
    p_table
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges de table.
--
-- Supabase n'accorde plus select/insert/update/delete au role `authenticated`
-- par defaut sur les nouvelles tables du schema public : il faut les donner
-- explicitement. La RLS reste le seul filtre metier ; ces GRANT ne font
-- qu'ouvrir la porte au niveau Postgres.
-- -----------------------------------------------------------------------------
create or replace function private.grant_crud(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format('grant select, insert, update, delete on %s to authenticated', p_table);
  execute format('grant all on %s to service_role', p_table);
end;
$$;

create or replace function private.grant_read(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format('grant select on %s to authenticated', p_table);
  execute format('grant all on %s to service_role', p_table);
end;
$$;

-- >>> 0002_core_tenancy.sql
-- =============================================================================
-- 0002 — Socle multi-etablissement : ecoles, annees scolaires, periodes, calendrier
-- =============================================================================

-- -----------------------------------------------------------------------------
-- schools — le tenant. Tout le reste du schema en depend.
-- -----------------------------------------------------------------------------
create table public.schools (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  type         public.school_type not null default 'high_school',
  email        text,
  phone        text,
  website      text,
  address      text,
  city         text,
  country      text,
  logo_url     text,
  timezone     text not null default 'Europe/Paris',
  locale       text not null default 'fr',
  currency     text not null default 'EUR',
  -- Parametrage variable : bareme, mode de notation, vocabulaire, horaires...
  settings     jsonb not null default jsonb_build_object(
    'grading', jsonb_build_object(
      'mode', 'weighted_average',   -- 'weighted_average' (/20) | 'ects' (credits)
      'scale', 20,
      'passing_score', 10,
      'compensation', false,
      'compensation_floor', 7
    ),
    'terms_per_year', 3,
    'week_days', jsonb_build_array(1, 2, 3, 4, 5),
    'day_start', '08:00',
    'day_end', '18:00',
    'matricule_prefix', '',
    'vocabulary', jsonb_build_object(
      'class', 'Classe', 'term', 'Trimestre', 'subject', 'Matiere'
    )
  ),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint schools_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint schools_currency_format check (currency ~ '^[A-Z]{3}$')
);

comment on column public.schools.settings is
  'Parametrage par etablissement. settings->grading->>mode pilote le calcul des moyennes.';

select private.attach_updated_at('public.schools');

-- -----------------------------------------------------------------------------
-- academic_years — une seule annee "courante" par etablissement
-- -----------------------------------------------------------------------------
create table public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,                       -- '2025-2026'
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  is_closed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint academic_years_unique_name unique (school_id, name),
  constraint academic_years_date_order check (end_date > start_date)
);

create unique index academic_years_one_current
  on public.academic_years (school_id)
  where is_current;

create index academic_years_school_idx on public.academic_years (school_id, start_date desc);

select private.attach_updated_at('public.academic_years');

-- -----------------------------------------------------------------------------
-- terms — trimestres / semestres. is_locked gele la saisie de notes.
-- -----------------------------------------------------------------------------
create table public.terms (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  name              text not null,                 -- '1er trimestre', 'Semestre 1'
  kind              public.term_kind not null default 'trimester',
  sequence          smallint not null,             -- 1, 2, 3...
  start_date        date not null,
  end_date          date not null,
  is_current        boolean not null default false,
  is_locked         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint terms_unique_sequence unique (academic_year_id, sequence),
  constraint terms_date_order check (end_date > start_date),
  constraint terms_sequence_positive check (sequence > 0)
);

create unique index terms_one_current
  on public.terms (school_id)
  where is_current;

create index terms_year_idx on public.terms (academic_year_id, sequence);

select private.attach_updated_at('public.terms');

comment on column public.terms.is_locked is
  'Verrouille la saisie et la modification des notes une fois les bulletins publies.';

-- -----------------------------------------------------------------------------
-- school_calendar — vacances, jours feries, periodes d'examens.
-- Consulte par la generation des seances de cours et le calcul d'assiduite.
-- -----------------------------------------------------------------------------
create table public.school_calendar (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  name              text not null,
  type              public.calendar_event_type not null default 'holiday',
  start_date        date not null,
  end_date          date not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint school_calendar_date_order check (end_date >= start_date)
);

create index school_calendar_lookup_idx
  on public.school_calendar (school_id, academic_year_id, start_date);

select private.attach_updated_at('public.school_calendar');

-- -----------------------------------------------------------------------------
-- Coherence : une periode reste dans les bornes de son annee scolaire
-- -----------------------------------------------------------------------------
create or replace function public.check_term_within_year()
returns trigger
language plpgsql
as $$
declare
  v_start date;
  v_end   date;
begin
  select start_date, end_date into v_start, v_end
  from public.academic_years
  where id = new.academic_year_id;

  if new.start_date < v_start or new.end_date > v_end then
    raise exception 'La periode "%" (% -> %) sort des bornes de l''annee scolaire (% -> %).',
      new.name, new.start_date, new.end_date, v_start, v_end
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger terms_within_year
  before insert or update of start_date, end_date, academic_year_id on public.terms
  for each row execute function public.check_term_within_year();

-- -----------------------------------------------------------------------------
-- Privileges (la RLS, posee en 0005, reste le filtre metier)
-- -----------------------------------------------------------------------------
select private.grant_crud('public.schools');
select private.grant_crud('public.academic_years');
select private.grant_crud('public.terms');
select private.grant_crud('public.school_calendar');

-- >>> 0003_identity.sql
-- =============================================================================
-- 0003 — Identite : profils, appartenances (tenancy), enseignants
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — miroir applicatif de auth.users, global (non rattache a une ecole)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  first_name        text,
  last_name         text,
  full_name         text generated always as (
                      nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
                    ) stored,
  avatar_url        text,
  phone             text,
  locale            text not null default 'fr',
  -- Administrateur de la plateforme (support Kasia), au-dessus des etablissements.
  -- Non modifiable par l'utilisateur : voir le trigger profiles_guard_platform_admin.
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index profiles_full_name_idx on public.profiles (lower(full_name));

select private.attach_updated_at('public.profiles');

-- Creation automatique du profil a l'inscription Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, avatar_url, phone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un utilisateur ne peut pas s'auto-promouvoir administrateur plateforme
create or replace function public.guard_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin then
    if not coalesce(
      (select p.is_platform_admin from public.profiles p where p.id = (select auth.uid())),
      false
    ) then
      raise exception 'Seul un administrateur plateforme peut modifier ce droit.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_platform_admin
  before update on public.profiles
  for each row execute function public.guard_platform_admin();

-- -----------------------------------------------------------------------------
-- memberships — pivot central de la tenancy (utilisateur x etablissement x role)
-- -----------------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.user_role not null,
  is_active   boolean not null default true,
  invited_by  uuid references public.profiles(id) on delete set null,
  invited_at  timestamptz,
  joined_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint memberships_unique unique (school_id, user_id, role)
);

create index memberships_user_idx on public.memberships (user_id) where is_active;
create index memberships_school_role_idx on public.memberships (school_id, role) where is_active;

select private.attach_updated_at('public.memberships');

comment on table public.memberships is
  'Pivot multi-tenant. Un utilisateur peut appartenir a plusieurs etablissements avec des roles differents.';

-- -----------------------------------------------------------------------------
-- teachers — fiche enseignant. profile_id nullable : un enseignant peut figurer
-- a l''emploi du temps avant d''avoir un compte.
-- -----------------------------------------------------------------------------
create type public.staff_status as enum ('active', 'on_leave', 'suspended', 'left');

create table public.teachers (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  profile_id     uuid references public.profiles(id) on delete set null,
  employee_no    text,
  first_name     text not null,
  last_name      text not null,
  full_name      text generated always as (first_name || ' ' || last_name) stored,
  email          text,
  phone          text,
  birth_date     date,
  gender         text,
  address        text,
  hire_date      date,
  contract_type  text,
  speciality     text,
  photo_url      text,
  status         public.staff_status not null default 'active',
  notes          text,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint teachers_employee_no_unique unique (school_id, employee_no),
  constraint teachers_gender_values check (gender is null or gender in ('male', 'female', 'other'))
);

create index teachers_school_idx on public.teachers (school_id) where deleted_at is null;
create index teachers_profile_idx on public.teachers (profile_id) where profile_id is not null;
create index teachers_name_idx on public.teachers (school_id, lower(full_name));

select private.attach_updated_at('public.teachers');

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
select private.grant_crud('public.profiles');
select private.grant_crud('public.memberships');
select private.grant_crud('public.teachers');

-- >>> 0004_rls_helpers.sql
-- =============================================================================
-- 0004 — Fonctions d'aide RLS
--
-- Toutes en SECURITY DEFINER : elles lisent memberships/profiles en contournant
-- la RLS, ce qui evite toute recursion de policy. STABLE permet a Postgres de
-- mettre le resultat en cache pour la duree de la requete.
-- =============================================================================

-- Etablissements auxquels l'utilisateur courant appartient
create or replace function private.user_school_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.school_id), array[]::uuid[])
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.is_active
$$;

-- Administrateur de la plateforme (voit tout)
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = (select auth.uid())),
    false
  )
$$;

-- Membre (quel que soit le role) d'un etablissement donne
create or replace function private.is_school_member(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin()
     or exists (
       select 1 from public.memberships m
       where m.user_id = (select auth.uid())
         and m.school_id = p_school
         and m.is_active
     )
$$;

-- Test de role explicite
create or replace function private.has_role(p_school uuid, p_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin()
     or exists (
       select 1 from public.memberships m
       where m.user_id = (select auth.uid())
         and m.school_id = p_school
         and m.is_active
         and m.role = any(p_roles)
     )
$$;

-- Raccourci administration (super admin + admin d'etablissement)
create or replace function private.is_school_admin(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_school, array['super_admin', 'school_admin']::public.user_role[])
$$;

-- Administration + comptabilite : acces lecture large sur le dossier eleve
create or replace function private.is_school_staff(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(
    p_school,
    array['super_admin', 'school_admin', 'accountant']::public.user_role[]
  )
$$;

grant execute on function
  private.user_school_ids(),
  private.is_platform_admin(),
  private.is_school_member(uuid),
  private.has_role(uuid, public.user_role[]),
  private.is_school_admin(uuid),
  private.is_school_staff(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Hook JWT (optionnel, a activer dans Dashboard > Authentication > Hooks).
-- Injecte school_ids et roles dans le token pour eviter une lecture de
-- memberships par policy. Les fonctions ci-dessus restent la source de verite ;
-- ce hook n'est qu'une optimisation, et le front l'utilise pour l'affichage.
-- -----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_user   uuid := (event ->> 'user_id')::uuid;
  v_roles  jsonb;
begin
  v_claims := event -> 'claims';

  select coalesce(jsonb_object_agg(m.school_id::text, m.role), '{}'::jsonb)
  into v_roles
  from public.memberships m
  where m.user_id = v_user
    and m.is_active;

  v_claims := jsonb_set(v_claims, '{school_roles}', v_roles);
  v_claims := jsonb_set(
    v_claims,
    '{is_platform_admin}',
    to_jsonb(coalesce((select p.is_platform_admin from public.profiles p where p.id = v_user), false))
  );

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- >>> 0005_core_policies.sql
-- =============================================================================
-- 0005 — RLS du socle : profils, appartenances, etablissements, annees, periodes
-- =============================================================================

-- Deux utilisateurs partagent-ils un etablissement ? (annuaire interne)
create or replace function private.shares_school_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin()
     or exists (
       select 1
       from public.memberships me
       join public.memberships other on other.school_id = me.school_id
       where me.user_id = (select auth.uid())
         and me.is_active
         and other.user_id = p_user
         and other.is_active
     )
$$;

grant execute on function private.shares_school_with(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_school_with(id));

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- memberships
-- -----------------------------------------------------------------------------
alter table public.memberships enable row level security;

create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_school_admin(school_id));

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (private.is_school_admin(school_id));

create policy memberships_update on public.memberships
  for update to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (private.is_school_admin(school_id));

-- -----------------------------------------------------------------------------
-- schools — creation via public.create_school() uniquement (voir plus bas)
-- -----------------------------------------------------------------------------
alter table public.schools enable row level security;

create policy schools_select on public.schools
  for select to authenticated
  using (private.is_school_member(id));

create policy schools_insert on public.schools
  for insert to authenticated
  with check (private.is_platform_admin());

create policy schools_update on public.schools
  for update to authenticated
  using (private.is_school_admin(id))
  with check (private.is_school_admin(id));

create policy schools_delete on public.schools
  for delete to authenticated
  using (private.is_platform_admin());

-- -----------------------------------------------------------------------------
-- academic_years / terms / school_calendar : lecture = membre, ecriture = admin
-- -----------------------------------------------------------------------------
alter table public.academic_years enable row level security;

create policy academic_years_select on public.academic_years
  for select to authenticated
  using (private.is_school_member(school_id));

create policy academic_years_write on public.academic_years
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

alter table public.terms enable row level security;

create policy terms_select on public.terms
  for select to authenticated
  using (private.is_school_member(school_id));

create policy terms_write on public.terms
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

alter table public.school_calendar enable row level security;

create policy school_calendar_select on public.school_calendar
  for select to authenticated
  using (private.is_school_member(school_id));

create policy school_calendar_write on public.school_calendar
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

-- -----------------------------------------------------------------------------
-- teachers — dossier complet reserve a l'administration et aux enseignants.
--
-- Le comptable en est exclu volontairement : son perimetre porte sur les frais
-- de scolarite, pas sur les donnees personnelles du personnel (date de
-- naissance, adresse). Il accede a l'annuaire via teacher_directory, comme les
-- eleves et les parents.
-- -----------------------------------------------------------------------------
alter table public.teachers enable row level security;

create policy teachers_select on public.teachers
  for select to authenticated
  using (
    private.is_school_admin(school_id)
    or private.has_role(school_id, array['teacher']::public.user_role[])
    or profile_id = (select auth.uid())
  );

create policy teachers_write on public.teachers
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

-- L'enseignant met a jour ses propres coordonnees
create policy teachers_update_self on public.teachers
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Annuaire : colonnes non sensibles, visibles par tout membre de l'etablissement.
-- Vue en droits du proprietaire (security_invoker off) : le filtre d'acces est
-- porte explicitement par le WHERE ci-dessous.
create view public.teacher_directory
with (security_invoker = false) as
  select t.id,
         t.school_id,
         t.first_name,
         t.last_name,
         t.full_name,
         t.email,
         t.speciality,
         t.photo_url,
         t.status
  from public.teachers t
  where t.deleted_at is null
    and private.is_school_member(t.school_id);

grant select on public.teacher_directory to authenticated;

comment on view public.teacher_directory is
  'Annuaire enseignants : sous-ensemble non sensible de public.teachers, accessible a tout membre de l''etablissement.';

-- -----------------------------------------------------------------------------
-- create_school — onboarding : cree l'etablissement et rattache l'appelant
-- comme super_admin, en une transaction.
-- -----------------------------------------------------------------------------
create or replace function public.create_school(
  p_name     text,
  p_slug     text,
  p_type     public.school_type default 'high_school',
  p_currency text default 'EUR',
  p_timezone text default 'Europe/Paris'
)
returns public.schools
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := (select auth.uid());
  v_school public.schools;
begin
  if v_user is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  insert into public.schools (name, slug, type, currency, timezone)
  values (p_name, p_slug, p_type, p_currency, p_timezone)
  returning * into v_school;

  insert into public.memberships (school_id, user_id, role, joined_at)
  values (v_school.id, v_user, 'super_admin', now());

  return v_school;
end;
$$;

grant execute on function public.create_school(text, text, public.school_type, text, text)
  to authenticated;

-- >>> 0006_numbering.sql
-- =============================================================================
-- 0006 — Numerotation sequentielle (matricules, factures, recus, convocations)
-- =============================================================================

create table public.number_sequences (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  kind           text not null,          -- 'matricule' | 'invoice' | 'receipt' | 'convocation' | 'transcript'
  year           integer not null,
  prefix         text not null default '',
  padding        smallint not null default 4,
  current_value  bigint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint number_sequences_unique unique (school_id, kind, year),
  constraint number_sequences_padding_range check (padding between 1 and 12),
  constraint number_sequences_kind_not_blank check (length(trim(kind)) > 0)
);

select private.attach_updated_at('public.number_sequences');

alter table public.number_sequences enable row level security;

-- Lecture seule pour l'administration (parametrage des prefixes).
-- L'increment passe obligatoirement par public.next_number().
create policy number_sequences_select on public.number_sequences
  for select to authenticated
  using (private.is_school_admin(school_id));

create policy number_sequences_update on public.number_sequences
  for update to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

-- -----------------------------------------------------------------------------
-- next_number — atomique. Le INSERT ... ON CONFLICT DO UPDATE verrouille la
-- ligne : deux inscriptions simultanees ne peuvent pas obtenir le meme numero.
-- -----------------------------------------------------------------------------
create or replace function public.next_number(
  p_school uuid,
  p_kind   text,
  p_year   integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year   integer;
  v_value  bigint;
  v_prefix text;
  v_pad    smallint;
begin
  if not private.is_school_member(p_school) then
    raise exception 'Acces refuse a cet etablissement.' using errcode = '42501';
  end if;

  v_year := coalesce(p_year, extract(year from current_date)::integer);

  insert into public.number_sequences (school_id, kind, year, current_value, prefix)
  values (
    p_school,
    p_kind,
    v_year,
    1,
    coalesce(
      case p_kind
        when 'matricule' then (select s.settings #>> '{matricule_prefix}' from public.schools s where s.id = p_school)
        else null
      end,
      ''
    )
  )
  on conflict (school_id, kind, year)
    do update set current_value = public.number_sequences.current_value + 1
  returning current_value, prefix, padding into v_value, v_prefix, v_pad;

  return concat_ws(
    '-',
    nullif(v_prefix, ''),
    v_year::text,
    lpad(v_value::text, v_pad, '0')
  );
end;
$$;

grant execute on function public.next_number(uuid, text, integer) to authenticated;

comment on function public.next_number is
  'Retourne le numero suivant pour un type de sequence, au format PREFIX-ANNEE-0001. Atomique.';

select private.grant_read('public.number_sequences');
grant update on public.number_sequences to authenticated;

-- >>> 0007_audit.sql
-- =============================================================================
-- 0007 — Journal d'audit
--
-- Pose sur les tables sensibles au fil des modules : notes, paiements,
-- deliberations, appartenances, inscriptions.
-- =============================================================================

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  school_id    uuid references public.schools(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,          -- 'insert' | 'update' | 'delete'
  entity_type  text not null,          -- nom de la table
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

create index audit_logs_school_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

alter table public.audit_logs enable row level security;

-- Consultation reservee a l'administration. Aucune policy d'ecriture :
-- seul le trigger (SECURITY DEFINER) alimente la table.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (private.is_school_admin(school_id));

-- -----------------------------------------------------------------------------
-- Trigger generique. S'attache a n'importe quelle table possedant school_id
-- et une cle primaire uuid nommee id.
-- -----------------------------------------------------------------------------
create or replace function public.record_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_id     uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after  := null;
    v_school := (v_before ->> 'school_id')::uuid;
    v_id     := (v_before ->> 'id')::uuid;
  elsif tg_op = 'INSERT' then
    v_before := null;
    v_after  := to_jsonb(new);
    v_school := (v_after ->> 'school_id')::uuid;
    v_id     := (v_after ->> 'id')::uuid;
  else
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_school := (v_after ->> 'school_id')::uuid;
    v_id     := (v_after ->> 'id')::uuid;

    -- Rien de fonctionnel n'a change : on n'enregistre pas.
    if v_before - 'updated_at' = v_after - 'updated_at' then
      return coalesce(new, old);
    end if;
  end if;

  insert into public.audit_logs (school_id, actor_id, action, entity_type, entity_id, before, after)
  values (v_school, (select auth.uid()), lower(tg_op), tg_table_name, v_id, v_before, v_after);

  return coalesce(new, old);
end;
$$;

comment on function public.record_audit is
  'Trigger AFTER INSERT/UPDATE/DELETE : journalise la ligne dans audit_logs. Requiert les colonnes id et school_id.';

-- Raccourci de pose
create or replace function private.attach_audit(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create or replace trigger record_audit after insert or update or delete on %s
       for each row execute function public.record_audit()',
    p_table
  );
end;
$$;

select private.attach_audit('public.memberships');

select private.grant_read('public.audit_logs');

-- >>> 0008_membership_directory.sql
-- =============================================================================
-- 0008 — Annuaire des membres et recherche de compte par e-mail
--
-- public.profiles ne stocke pas l'adresse e-mail (elle appartient a auth.users).
-- L'administration en a pourtant besoin pour gerer les acces : on l'expose via
-- une vue en droits du proprietaire, filtree explicitement sur le perimetre.
-- =============================================================================

create view public.school_members
with (security_invoker = false) as
  select m.id,
         m.school_id,
         m.user_id,
         m.role,
         m.is_active,
         m.invited_at,
         m.joined_at,
         m.created_at,
         p.first_name,
         p.last_name,
         p.full_name,
         p.avatar_url,
         p.phone,
         u.email,
         u.last_sign_in_at,
         (u.last_sign_in_at is not null) as has_signed_in
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where private.is_school_admin(m.school_id)
     or m.user_id = (select auth.uid());

grant select on public.school_members to authenticated;

comment on view public.school_members is
  'Annuaire des membres d''un etablissement (identite + e-mail + derniere connexion). Visible par l''administration, et par chacun pour ses propres appartenances.';

-- -----------------------------------------------------------------------------
-- Retrouve un compte existant a partir de son e-mail, pour rattacher un membre
-- deja inscrit dans un autre etablissement sans creer de doublon.
-- -----------------------------------------------------------------------------
create or replace function public.find_user_id_by_email(p_school uuid, p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_school_admin(p_school) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  return v_id;
end;
$$;

grant execute on function public.find_user_id_by_email(uuid, text) to authenticated;

-- >>> 0009_academic_structure.sql
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

-- >>> 0010_students.sql
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

-- >>> 0011_student_views_and_imports.sql
-- =============================================================================
-- 0011 — Vues de consultation et imports en masse
-- =============================================================================

-- -----------------------------------------------------------------------------
-- student_overview — une ligne par (eleve, annee scolaire).
--
-- security_invoker = true : la vue herite de la RLS de `students`, si bien que
-- chaque role y voit exactement le meme perimetre que sur la table de base.
-- Filtrer sur academic_year_id cote client donne une ligne par eleve.
-- -----------------------------------------------------------------------------
create view public.student_overview
with (security_invoker = true) as
  select s.id,
         s.school_id,
         s.profile_id,
         s.matricule,
         s.first_name,
         s.last_name,
         s.full_name,
         s.birth_date,
         s.gender,
         s.photo_url,
         s.email,
         s.phone,
         s.city,
         s.status,
         s.entry_date,
         s.created_at,
         e.id               as enrollment_id,
         e.status           as enrollment_status,
         e.is_repeating,
         e.enrolled_at,
         e.academic_year_id,
         c.id               as class_id,
         c.name             as class_name,
         l.id               as level_id,
         l.name             as level_name,
         p.id               as program_id,
         p.name             as program_name
  from public.students s
  left join public.enrollments e
    on e.student_id = s.id and e.status = 'active'
  left join public.classes c on c.id = e.class_id
  left join public.levels l on l.id = c.level_id
  left join public.programs p on p.id = c.program_id
  where s.deleted_at is null;

grant select on public.student_overview to authenticated;

comment on view public.student_overview is
  'Eleve + inscription active + classe/niveau/filiere. Une ligne par annee scolaire ; filtrer sur academic_year_id.';

-- -----------------------------------------------------------------------------
-- class_overview — effectifs et taux de remplissage.
--
-- security_invoker = false ici, a l'inverse : les effectifs doivent etre exacts
-- pour tout membre autorise a voir la classe. Sous RLS invoker, un eleve ne
-- comptant que sa propre inscription aurait vu "1 eleve" partout.
-- -----------------------------------------------------------------------------
create view public.class_overview
with (security_invoker = false) as
  select c.id,
         c.school_id,
         c.academic_year_id,
         c.name,
         c.code,
         c.capacity,
         c.level_id,
         c.program_id,
         c.main_teacher_id,
         c.default_room_id,
         c.created_at,
         l.name  as level_name,
         l.cycle as level_cycle,
         l.order_index as level_order,
         p.name  as program_name,
         t.full_name as main_teacher_name,
         r.name  as default_room_name,
         (select count(*) from public.enrollments e
           where e.class_id = c.id and e.status = 'active')     as enrolled_count,
         (select count(*) from public.class_subjects cs
           where cs.class_id = c.id)                            as subject_count,
         case
           when c.capacity is null or c.capacity = 0 then null
           else round(
             (select count(*) from public.enrollments e
               where e.class_id = c.id and e.status = 'active')::numeric
             * 100 / c.capacity, 1)
         end                                                    as fill_rate
  from public.classes c
  join public.levels l on l.id = c.level_id
  left join public.programs p on p.id = c.program_id
  left join public.teachers t on t.id = c.main_teacher_id
  left join public.rooms r on r.id = c.default_room_id
  where private.is_school_member(c.school_id);

grant select on public.class_overview to authenticated;

comment on view public.class_overview is
  'Classes avec effectif inscrit, nombre de matieres et taux de remplissage.';

-- -----------------------------------------------------------------------------
-- import_jobs — trace des imports CSV/Excel et de leurs erreurs ligne a ligne
-- -----------------------------------------------------------------------------
create type public.import_status as enum ('pending', 'processing', 'completed', 'failed');

create table public.import_jobs (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  entity        text not null,          -- 'students' | 'teachers' | 'guardians'
  filename      text not null,
  storage_path  text,
  status        public.import_status not null default 'pending',
  total_rows    integer not null default 0,
  success_rows  integer not null default 0,
  error_rows    integer not null default 0,
  errors        jsonb not null default '[]'::jsonb,
  options       jsonb not null default '{}'::jsonb,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint import_jobs_entity_values check (entity in ('students', 'teachers', 'guardians'))
);

create index import_jobs_school_idx on public.import_jobs (school_id, created_at desc);

select private.attach_updated_at('public.import_jobs');

alter table public.import_jobs enable row level security;

create policy import_jobs_select on public.import_jobs
  for select to authenticated
  using (private.is_school_admin(school_id));

create policy import_jobs_write on public.import_jobs
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.import_jobs');

-- -----------------------------------------------------------------------------
-- enroll_students — inscrit un lot d'eleves dans une classe.
--
-- Regroupe en une transaction la cloture de l'inscription active precedente et
-- la creation de la nouvelle : evite l'echec de l'index partiel
-- enrollments_one_active_per_year lors d'un changement de classe.
-- -----------------------------------------------------------------------------
create or replace function public.enroll_students(
  p_class_id     uuid,
  p_student_ids  uuid[],
  p_is_repeating boolean default false
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
    raise exception 'Seule l''administration peut inscrire un eleve.' using errcode = '42501';
  end if;

  -- Cloture des inscriptions actives de la meme annee, hors classe cible.
  update public.enrollments e
  set status = 'transferred', withdrawn_at = current_date
  where e.student_id = any (p_student_ids)
    and e.academic_year_id = v_year
    and e.status = 'active'
    and e.class_id <> p_class_id;

  insert into public.enrollments (school_id, student_id, class_id, academic_year_id, is_repeating)
  select v_school, s.id, p_class_id, v_year, p_is_repeating
  from public.students s
  where s.id = any (p_student_ids)
    and s.school_id = v_school
    and s.deleted_at is null
  on conflict (student_id, class_id) do update
    set status = 'active', withdrawn_at = null, withdrawal_reason = null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.enroll_students(uuid, uuid[], boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- apply_subject_template — cree les matieres d'une classe a partir du modele
-- defini pour son niveau (subject_levels).
-- -----------------------------------------------------------------------------
create or replace function public.apply_subject_template(p_class_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_level  uuid;
  v_count  integer := 0;
begin
  select school_id, level_id into v_school, v_level
  from public.classes where id = p_class_id;

  if v_school is null then
    raise exception 'Classe introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  insert into public.class_subjects (
    school_id, class_id, subject_id, coefficient, credits, max_score, weekly_hours
  )
  select v_school, p_class_id, sl.subject_id,
         sl.default_coefficient, sl.default_credits,
         sl.default_max_score, sl.default_weekly_hours
  from public.subject_levels sl
  where sl.level_id = v_level
    and sl.school_id = v_school
  on conflict (class_id, subject_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.apply_subject_template(uuid) to authenticated;

-- >>> 0012_storage.sql
-- =============================================================================
-- 0012 — Buckets Storage et policies
--
-- Convention de chemin : {school_id}/... — le premier segment porte l'isolation
-- multi-etablissement, exactement comme la colonne school_id en base.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',        'avatars',        false, 2  * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('student-photos', 'student-photos', false, 2  * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('documents',      'documents',      false, 10 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('report-cards',   'report-cards',   false, 10 * 1024 * 1024,
   array['application/pdf']),
  ('finance',        'finance',        false, 10 * 1024 * 1024,
   array['application/pdf']),
  ('imports',        'imports',        false, 20 * 1024 * 1024,
   array['text/csv', 'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Conversion tolerante : un chemin dont le premier segment n'est pas un uuid
-- ne doit pas faire echouer la policy, seulement la rendre fausse.
create or replace function private.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function private.safe_uuid(text) to authenticated;

-- Etablissement porte par le chemin de l'objet
create or replace function private.storage_school_id(p_name text)
returns uuid
language sql
immutable
as $$
  select private.safe_uuid((storage.foldername(p_name))[1])
$$;

grant execute on function private.storage_school_id(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Lecture : tout membre de l'etablissement proprietaire du chemin.
-- Ecriture : administration uniquement, sauf avatars (chacun le sien).
-- -----------------------------------------------------------------------------
create policy storage_read_own_school on storage.objects
  for select to authenticated
  using (
    bucket_id in ('avatars', 'student-photos', 'documents', 'report-cards', 'finance', 'imports')
    and private.is_school_member(private.storage_school_id(name))
  );

create policy storage_write_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('student-photos', 'documents', 'report-cards', 'finance', 'imports')
    and private.is_school_admin(private.storage_school_id(name))
  );

create policy storage_update_admin on storage.objects
  for update to authenticated
  using (
    bucket_id in ('student-photos', 'documents', 'report-cards', 'finance', 'imports')
    and private.is_school_admin(private.storage_school_id(name))
  )
  with check (
    bucket_id in ('student-photos', 'documents', 'report-cards', 'finance', 'imports')
    and private.is_school_admin(private.storage_school_id(name))
  );

create policy storage_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('student-photos', 'documents', 'report-cards', 'finance', 'imports')
    and private.is_school_admin(private.storage_school_id(name))
  );

-- Avatars : {school_id}/{user_id}.ext — chacun gere le sien.
create policy storage_avatar_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and private.is_school_member(private.storage_school_id(name))
    and (storage.filename(name)) like ((select auth.uid())::text || '%')
  );

create policy storage_avatar_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.filename(name)) like ((select auth.uid())::text || '%')
  )
  with check (
    bucket_id = 'avatars'
    and (storage.filename(name)) like ((select auth.uid())::text || '%')
  );

create policy storage_avatar_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.filename(name)) like ((select auth.uid())::text || '%')
  );

-- >>> 0013_revoke_anon.sql
-- =============================================================================
-- 0013 — Retrait des privileges du role anon
--
-- Selon la version du projet, Supabase accorde par defaut select/insert/update/
-- delete au role `anon` sur les nouvelles tables du schema public. Aucune donnee
-- ne fuit pour autant : toutes nos policies ciblent `authenticated`, si bien
-- qu'un appel anonyme ne satisfait aucune policy et repart les mains vides.
--
-- On ne s'appuie pas sur cette absence de policy. Un oubli de `to authenticated`
-- dans une migration future suffirait a ouvrir une table au public. Le retrait
-- explicite des privileges ferme la porte un cran plus bas, independamment des
-- policies.
--
-- L'application n'a aucun besoin anonyme : la connexion passe par les endpoints
-- /auth/v1, jamais par PostgREST.
-- =============================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on schema public from anon;

-- Les objets crees par les migrations suivantes heritent de la meme regle.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Le schema prive n'a jamais ete expose ; on le verrouille explicitement.
revoke all on schema private from anon;

do $$
begin
  raise notice 'Privileges du role anon retires du schema public.';
end
$$;

-- >>> 0014_timetable.sql
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

-- >>> 0015_grading.sql
-- =============================================================================
-- 0015 — Notes, moyennes et bulletins
--
-- Une seule chaine de saisie (assessments -> grades -> moyenne par matiere),
-- deux restitutions selon schools.settings->grading->>mode :
--   weighted_average — moyenne generale ponderee par coefficient, rang
--   ects             — unites d'enseignement, credits, compensation
--
-- Les vues calculent en direct pour la saisie et les tableaux de bord ; les
-- tables term_*_results figent le resultat a la publication. Un bulletin remis
-- ne doit pas changer si un coefficient est corrige six mois plus tard.
-- =============================================================================

create type public.study_unit_kind as enum (
  'fundamental', 'methodology', 'discovery', 'transversal', 'other'
);

create type public.validation_mode as enum ('direct', 'compensation', 'resit');

-- -----------------------------------------------------------------------------
-- Types d'evaluation (devoir, controle continu, examen...)
-- -----------------------------------------------------------------------------
create table public.assessment_types (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  name           text not null,
  code           text,
  default_weight numeric(4,2) not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint assessment_types_unique_name unique (school_id, name),
  constraint assessment_types_weight_positive check (default_weight > 0)
);

select private.attach_updated_at('public.assessment_types');

-- -----------------------------------------------------------------------------
-- Evaluations
-- -----------------------------------------------------------------------------
create table public.assessments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  class_subject_id   uuid not null references public.class_subjects(id) on delete cascade,
  term_id            uuid not null references public.terms(id) on delete cascade,
  assessment_type_id uuid references public.assessment_types(id) on delete set null,
  title              text not null,
  description        text,
  date               date not null default current_date,
  max_score          numeric(5,2) not null default 20,
  weight             numeric(4,2) not null default 1,
  is_published       boolean not null default false,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint assessments_max_score_positive check (max_score > 0),
  constraint assessments_weight_positive check (weight > 0)
);

create index assessments_class_subject_idx on public.assessments (class_subject_id, term_id);
create index assessments_term_idx on public.assessments (school_id, term_id);

select private.attach_updated_at('public.assessments');

comment on column public.assessments.weight is
  'Poids de l''evaluation dans la moyenne de la matiere. Distinct du coefficient de la matiere.';

-- -----------------------------------------------------------------------------
-- Notes
--
-- score null = non saisi ; is_absent distingue l'absence d'un zero. Une absence
-- justifiee sort du calcul, une absence non justifiee compte comme zero.
-- -----------------------------------------------------------------------------
create table public.grades (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  score          numeric(5,2),
  is_absent      boolean not null default false,
  is_excused     boolean not null default false,
  comment        text,
  graded_by      uuid references public.profiles(id) on delete set null,
  graded_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint grades_unique unique (assessment_id, student_id),
  constraint grades_score_positive check (score is null or score >= 0)
);

create index grades_student_idx on public.grades (student_id);
create index grades_assessment_idx on public.grades (assessment_id);

select private.attach_updated_at('public.grades');

-- La note ne peut pas depasser le bareme de son evaluation.
create or replace function public.check_grade_bounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max    numeric;
  v_locked boolean;
begin
  select a.max_score, t.is_locked
    into v_max, v_locked
  from public.assessments a
  join public.terms t on t.id = a.term_id
  where a.id = new.assessment_id;

  if new.score is not null and new.score > v_max then
    raise exception 'Note % superieure au bareme de l''evaluation (%).', new.score, v_max
      using errcode = '23514';
  end if;

  -- Le verrouillage de periode s'applique a tous sauf a l'administration.
  if v_locked and not private.is_school_admin(new.school_id) then
    raise exception 'Cette periode est verrouillee : la saisie de notes y est close.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger grades_check_bounds
  before insert or update on public.grades
  for each row execute function public.check_grade_bounds();

create trigger grades_same_school
  before insert or update on public.grades
  for each row execute function public.check_same_school(
    'assessment_id', 'assessments',
    'student_id', 'students'
  );

-- -----------------------------------------------------------------------------
-- Unites d'enseignement — mode ECTS uniquement. Vides ailleurs, sans qu'aucune
-- autre partie du schema n'ait a s'en soucier.
-- -----------------------------------------------------------------------------
create table public.study_units (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  term_id           uuid references public.terms(id) on delete cascade,
  level_id          uuid references public.levels(id) on delete set null,
  program_id        uuid references public.programs(id) on delete set null,
  code              text not null,
  name              text not null,
  credits           numeric(4,1) not null,
  kind              public.study_unit_kind not null default 'fundamental',
  is_compulsory     boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint study_units_unique_code unique (school_id, academic_year_id, code),
  constraint study_units_credits_positive check (credits > 0)
);

select private.attach_updated_at('public.study_units');

create table public.study_unit_subjects (
  school_id        uuid not null references public.schools(id) on delete cascade,
  study_unit_id    uuid not null references public.study_units(id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  weight           numeric(4,2) not null default 1,

  primary key (study_unit_id, class_subject_id),
  constraint study_unit_subjects_weight_positive check (weight > 0)
);

-- Une matiere n'appartient qu'a une seule UE.
create unique index study_unit_subjects_one_unit
  on public.study_unit_subjects (class_subject_id);

-- =============================================================================
-- Calcul en direct
-- =============================================================================

-- Moyenne par eleve, matiere et periode, ramenee au bareme de l'etablissement.
create view public.subject_averages
with (security_invoker = true) as
  select g.student_id,
         a.class_subject_id,
         a.term_id,
         cs.class_id,
         cs.school_id,
         cs.subject_id,
         cs.coefficient,
         cs.credits,
         round(
           sum(
             case when g.is_absent and not g.is_excused then 0
                  else g.score / a.max_score * coalesce((s.settings #>> '{grading,scale}')::numeric, 20)
             end * a.weight
           ) / nullif(sum(a.weight), 0)
         , 2) as average,
         count(*) filter (where g.score is not null or g.is_absent) as graded_count
  from public.grades g
  join public.assessments a on a.id = g.assessment_id
  join public.class_subjects cs on cs.id = a.class_subject_id
  join public.schools s on s.id = cs.school_id
  -- Une absence justifiee ne compte pas : elle sortirait la moyenne du reel.
  where not (g.is_absent and g.is_excused)
    and (g.score is not null or g.is_absent)
  group by g.student_id, a.class_subject_id, a.term_id,
           cs.class_id, cs.school_id, cs.subject_id, cs.coefficient, cs.credits;

grant select on public.subject_averages to authenticated;

-- Moyenne generale ponderee et rang dans la classe (mode /20).
create view public.term_averages
with (security_invoker = true) as
  select sa.student_id,
         sa.class_id,
         sa.school_id,
         sa.term_id,
         round(sum(sa.average * sa.coefficient) / nullif(sum(sa.coefficient), 0), 2) as general_average,
         sum(sa.coefficient) as total_coefficient,
         count(*) as subject_count,
         rank() over (
           partition by sa.class_id, sa.term_id
           order by sum(sa.average * sa.coefficient) / nullif(sum(sa.coefficient), 0) desc
         ) as rank
  from public.subject_averages sa
  group by sa.student_id, sa.class_id, sa.school_id, sa.term_id;

grant select on public.term_averages to authenticated;

-- Moyenne par UE et credits (mode ECTS).
create view public.unit_averages
with (security_invoker = true) as
  select sa.student_id,
         su.id   as study_unit_id,
         su.school_id,
         su.term_id,
         sa.class_id,
         su.credits,
         round(sum(sa.average * sus.weight) / nullif(sum(sus.weight), 0), 2) as average
  from public.subject_averages sa
  join public.study_unit_subjects sus on sus.class_subject_id = sa.class_subject_id
  join public.study_units su on su.id = sus.study_unit_id
  group by sa.student_id, su.id, su.school_id, su.term_id, sa.class_id, su.credits;

grant select on public.unit_averages to authenticated;

-- =============================================================================
-- Instantanes figes a la publication
-- =============================================================================
create table public.term_subject_results (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  term_id          uuid not null references public.terms(id) on delete cascade,
  average          numeric(5,2),
  coefficient      numeric(4,2) not null default 1,
  rank             integer,
  class_average    numeric(5,2),
  class_min        numeric(5,2),
  class_max        numeric(5,2),
  teacher_comment  text,
  computed_at      timestamptz not null default now(),

  constraint term_subject_results_unique unique (student_id, class_subject_id, term_id)
);

create index term_subject_results_term_idx on public.term_subject_results (term_id, student_id);

create table public.term_unit_results (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  student_id      uuid not null references public.students(id) on delete cascade,
  study_unit_id   uuid not null references public.study_units(id) on delete cascade,
  term_id         uuid not null references public.terms(id) on delete cascade,
  average         numeric(5,2),
  credits         numeric(4,1) not null default 0,
  credits_earned  numeric(4,1) not null default 0,
  is_validated    boolean not null default false,
  validation_mode public.validation_mode,
  computed_at     timestamptz not null default now(),

  constraint term_unit_results_unique unique (student_id, study_unit_id, term_id)
);

create table public.term_results (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  class_id          uuid not null references public.classes(id) on delete cascade,
  term_id           uuid not null references public.terms(id) on delete cascade,
  general_average   numeric(5,2),
  rank              integer,
  class_size        integer,
  class_average     numeric(5,2),
  credits_earned    numeric(5,1),
  credits_required  numeric(5,1),
  decision          text,
  head_comment      text,
  absences_count    integer not null default 0,
  late_count        integer not null default 0,
  is_published      boolean not null default false,
  published_at      timestamptz,
  published_by      uuid references public.profiles(id) on delete set null,
  pdf_path          text,
  computed_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint term_results_unique unique (student_id, term_id)
);

create index term_results_term_idx on public.term_results (term_id, rank);

select private.attach_updated_at('public.term_results');

-- -----------------------------------------------------------------------------
-- compute_term_results — fige les resultats d'une classe pour une periode.
--
-- Lit le mode de notation de l'etablissement et applique la branche
-- correspondante. Le frontend ne connait pas ces regles : il lit les tables.
-- -----------------------------------------------------------------------------
create or replace function public.compute_term_results(p_class_id uuid, p_term_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school       uuid;
  v_mode         text;
  v_passing      numeric;
  v_compensation boolean;
  v_floor        numeric;
  v_class_size   integer;
  v_count        integer := 0;
begin
  select c.school_id into v_school from public.classes c where c.id = p_class_id;

  if v_school is null then
    raise exception 'Classe introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school) then
    raise exception 'Seule l''administration peut arreter les resultats.' using errcode = '42501';
  end if;

  select s.settings #>> '{grading,mode}',
         coalesce((s.settings #>> '{grading,passing_score}')::numeric, 10),
         coalesce((s.settings #>> '{grading,compensation}')::boolean, false),
         coalesce((s.settings #>> '{grading,compensation_floor}')::numeric, 0)
    into v_mode, v_passing, v_compensation, v_floor
  from public.schools s where s.id = v_school;

  select count(*) into v_class_size
  from public.enrollments e
  where e.class_id = p_class_id and e.status = 'active';

  -- 1. Resultats par matiere, avec rang et statistiques de classe
  delete from public.term_subject_results
   where term_id = p_term_id
     and class_subject_id in (select id from public.class_subjects where class_id = p_class_id);

  insert into public.term_subject_results (
    school_id, student_id, class_subject_id, term_id, average, coefficient,
    rank, class_average, class_min, class_max
  )
  select v_school,
         sa.student_id,
         sa.class_subject_id,
         sa.term_id,
         sa.average,
         sa.coefficient,
         rank() over (partition by sa.class_subject_id order by sa.average desc),
         round(avg(sa.average) over (partition by sa.class_subject_id), 2),
         min(sa.average) over (partition by sa.class_subject_id),
         max(sa.average) over (partition by sa.class_subject_id)
  from public.subject_averages sa
  where sa.class_id = p_class_id and sa.term_id = p_term_id;

  -- 2. Resultats generaux
  delete from public.term_results where class_id = p_class_id and term_id = p_term_id;

  if v_mode = 'ects' then
    -- Moyenne du semestre ponderee par les credits, puis validation des UE.
    delete from public.term_unit_results
     where term_id = p_term_id
       and study_unit_id in (
         select distinct sus.study_unit_id
         from public.study_unit_subjects sus
         join public.class_subjects cs on cs.id = sus.class_subject_id
         where cs.class_id = p_class_id
       );

    with semester as (
      select ua.student_id,
             round(sum(ua.average * ua.credits) / nullif(sum(ua.credits), 0), 2) as average,
             sum(ua.credits) as credits_total
      from public.unit_averages ua
      where ua.class_id = p_class_id and ua.term_id = p_term_id
      group by ua.student_id
    ),
    validated as (
      select ua.student_id,
             ua.study_unit_id,
             ua.average,
             ua.credits,
             case
               when ua.average >= v_passing then 'direct'::public.validation_mode
               when v_compensation
                    and s.average >= v_passing
                    and ua.average >= v_floor then 'compensation'::public.validation_mode
               else null
             end as mode
      from public.unit_averages ua
      join semester s on s.student_id = ua.student_id
      where ua.class_id = p_class_id and ua.term_id = p_term_id
    )
    insert into public.term_unit_results (
      school_id, student_id, study_unit_id, term_id, average, credits,
      credits_earned, is_validated, validation_mode
    )
    select v_school, v.student_id, v.study_unit_id, p_term_id, v.average, v.credits,
           case when v.mode is not null then v.credits else 0 end,
           v.mode is not null,
           v.mode
    from validated v;

    insert into public.term_results (
      school_id, student_id, class_id, term_id, general_average, rank, class_size,
      class_average, credits_earned, credits_required
    )
    select v_school,
           t.student_id,
           p_class_id,
           p_term_id,
           t.average,
           rank() over (order by t.average desc),
           v_class_size,
           round(avg(t.average) over (), 2),
           coalesce(e.earned, 0),
           t.credits_total
    from (
      select ua.student_id,
             round(sum(ua.average * ua.credits) / nullif(sum(ua.credits), 0), 2) as average,
             sum(ua.credits) as credits_total
      from public.unit_averages ua
      where ua.class_id = p_class_id and ua.term_id = p_term_id
      group by ua.student_id
    ) t
    left join (
      select student_id, sum(credits_earned) as earned
      from public.term_unit_results
      where term_id = p_term_id
      group by student_id
    ) e on e.student_id = t.student_id;

  else
    insert into public.term_results (
      school_id, student_id, class_id, term_id, general_average, rank, class_size,
      class_average, decision
    )
    select v_school,
           ta.student_id,
           p_class_id,
           p_term_id,
           ta.general_average,
           ta.rank,
           v_class_size,
           round(avg(ta.general_average) over (), 2),
           case when ta.general_average >= v_passing then 'admis' else 'insuffisant' end
    from public.term_averages ta
    where ta.class_id = p_class_id and ta.term_id = p_term_id;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.compute_term_results(uuid, uuid) to authenticated;

-- Publication : rend les bulletins visibles aux eleves et aux parents.
create or replace function public.publish_term_results(p_class_id uuid, p_term_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_count  integer;
begin
  select school_id into v_school from public.classes where id = p_class_id;

  if not private.is_school_admin(v_school) then
    raise exception 'Seule l''administration peut publier les bulletins.' using errcode = '42501';
  end if;

  update public.term_results
     set is_published = true,
         published_at = now(),
         published_by = (select auth.uid())
   where class_id = p_class_id and term_id = p_term_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.publish_term_results(uuid, uuid) to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.assessment_types enable row level security;
create policy assessment_types_select on public.assessment_types
  for select to authenticated using (private.is_school_member(school_id));
create policy assessment_types_write on public.assessment_types
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.assessment_types');

-- Evaluations : l'enseignant gere celles de ses matieres.
alter table public.assessments enable row level security;

create policy assessments_select on public.assessments
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or class_subject_id in (
      select cs.id from public.class_subjects cs
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
    -- Eleves et parents ne voient que les evaluations publiees de leur classe.
    or (is_published and class_subject_id in (
      select cs.id from public.class_subjects cs
      join public.enrollments e on e.class_id = cs.class_id
      where e.student_id = any (private.my_student_ids()) and e.status = 'active'
    ))
  );

create policy assessments_write_teacher on public.assessments
  for all to authenticated
  using (
    class_subject_id in (
      select cs.id from public.class_subjects cs
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  )
  with check (
    class_subject_id in (
      select cs.id from public.class_subjects cs
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  );

create policy assessments_write_admin on public.assessments
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));

select private.grant_crud('public.assessments');

-- Notes
alter table public.grades enable row level security;

create policy grades_select on public.grades
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or assessment_id in (
      select a.id from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
    or (student_id = any (private.my_student_ids())
        and assessment_id in (select id from public.assessments where is_published))
  );

create policy grades_write_teacher on public.grades
  for all to authenticated
  using (
    assessment_id in (
      select a.id from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  )
  with check (
    assessment_id in (
      select a.id from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  );

create policy grades_write_admin on public.grades
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));

select private.grant_crud('public.grades');
select private.attach_audit('public.grades');

-- Unites d'enseignement
alter table public.study_units enable row level security;
create policy study_units_select on public.study_units
  for select to authenticated using (private.is_school_member(school_id));
create policy study_units_write on public.study_units
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.study_units');

alter table public.study_unit_subjects enable row level security;
create policy study_unit_subjects_select on public.study_unit_subjects
  for select to authenticated using (private.is_school_member(school_id));
create policy study_unit_subjects_write on public.study_unit_subjects
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.study_unit_subjects');

-- Resultats figes : lecture par l'administration, l'enseignant de la classe,
-- et par l'eleve ou son parent une fois publies.
alter table public.term_subject_results enable row level security;
create policy term_subject_results_select on public.term_subject_results
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.taught_student_ids())
    or (student_id = any (private.my_student_ids())
        and exists (select 1 from public.term_results tr
                    where tr.student_id = term_subject_results.student_id
                      and tr.term_id = term_subject_results.term_id
                      and tr.is_published))
  );
create policy term_subject_results_write on public.term_subject_results
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.term_subject_results');

alter table public.term_unit_results enable row level security;
create policy term_unit_results_select on public.term_unit_results
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.my_student_ids())
    or student_id = any (private.taught_student_ids())
  );
create policy term_unit_results_write on public.term_unit_results
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.term_unit_results');

alter table public.term_results enable row level security;
create policy term_results_select on public.term_results
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.taught_student_ids())
    or (student_id = any (private.my_student_ids()) and is_published)
  );
create policy term_results_write on public.term_results
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.term_results');

-- >>> 0016_exams.sql
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

-- >>> 0017_finance.sql
-- =============================================================================
-- 0017 — Frais de scolarite et gestion financiere
--
-- Le point delicat est le paiement partiel : un versement peut couvrir
-- plusieurs lignes de facture, et une ligne peut etre soldee par plusieurs
-- versements. D'ou payment_allocations, qui porte la relation N..N entre
-- paiements et lignes. Le montant paye d'une facture n'est jamais saisi : il
-- est recalcule par trigger depuis les affectations.
-- =============================================================================

create type public.fee_status as enum ('pending', 'partial', 'paid', 'waived', 'overdue');

create type public.invoice_status as enum (
  'draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'
);

create type public.payment_method as enum (
  'cash', 'bank_transfer', 'mobile_money', 'card', 'check', 'other'
);

create type public.payment_status as enum ('confirmed', 'pending', 'cancelled');

create type public.discount_kind as enum ('percentage', 'fixed');

create type public.reminder_channel as enum ('email', 'sms', 'in_app');

-- -----------------------------------------------------------------------------
-- Grilles tarifaires
-- -----------------------------------------------------------------------------
create table public.fee_categories (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  name         text not null,
  code         text,
  is_mandatory boolean not null default true,
  is_recurring boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint fee_categories_unique_name unique (school_id, name)
);

select private.attach_updated_at('public.fee_categories');

-- La grille se resout par specificite decroissante : classe, puis filiere,
-- puis niveau, puis tarif general.
create table public.fee_structures (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  fee_category_id  uuid not null references public.fee_categories(id) on delete cascade,
  level_id         uuid references public.levels(id) on delete cascade,
  program_id       uuid references public.programs(id) on delete cascade,
  class_id         uuid references public.classes(id) on delete cascade,
  amount           numeric(12,2) not null,
  currency         text not null default 'EUR',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint fee_structures_amount_positive check (amount >= 0)
);

create index fee_structures_lookup_idx
  on public.fee_structures (school_id, academic_year_id) where is_active;

select private.attach_updated_at('public.fee_structures');

create table public.fee_installments (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  fee_structure_id  uuid not null references public.fee_structures(id) on delete cascade,
  label             text not null,
  percentage        numeric(5,2),
  amount            numeric(12,2),
  due_date          date not null,
  order_index       smallint not null default 1,

  -- Une tranche s'exprime en pourcentage ou en montant, jamais les deux.
  constraint fee_installments_one_basis check (
    (percentage is not null and amount is null)
    or (percentage is null and amount is not null)
  )
);

create index fee_installments_structure_idx on public.fee_installments (fee_structure_id, order_index);

create table public.scholarships (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  kind        public.discount_kind not null default 'percentage',
  value       numeric(10,2) not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint scholarships_value_positive check (value > 0)
);

-- -----------------------------------------------------------------------------
-- Frais dus par eleve
-- -----------------------------------------------------------------------------
create table public.student_fees (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  fee_structure_id  uuid references public.fee_structures(id) on delete set null,
  fee_category_id   uuid not null references public.fee_categories(id) on delete restrict,
  amount_due        numeric(12,2) not null,
  discount_amount   numeric(12,2) not null default 0,
  scholarship_id    uuid references public.scholarships(id) on delete set null,
  net_due           numeric(12,2) generated always as (amount_due - discount_amount) stored,
  status            public.fee_status not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint student_fees_unique unique (student_id, academic_year_id, fee_category_id),
  constraint student_fees_amounts_positive check (amount_due >= 0 and discount_amount >= 0),
  constraint student_fees_discount_bounded check (discount_amount <= amount_due)
);

create index student_fees_student_idx on public.student_fees (student_id, academic_year_id);

select private.attach_updated_at('public.student_fees');

-- -----------------------------------------------------------------------------
-- Factures
-- -----------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  number            text not null,
  issue_date        date not null default current_date,
  due_date          date not null,
  total_amount      numeric(12,2) not null default 0,
  paid_amount       numeric(12,2) not null default 0,
  balance           numeric(12,2) generated always as (total_amount - paid_amount) stored,
  currency          text not null default 'EUR',
  status            public.invoice_status not null default 'draft',
  notes             text,
  pdf_path          text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint invoices_number_unique unique (school_id, number),
  constraint invoices_amounts_positive check (total_amount >= 0 and paid_amount >= 0)
);

create index invoices_student_idx on public.invoices (student_id, academic_year_id);
create index invoices_status_idx on public.invoices (school_id, status, due_date);

select private.attach_updated_at('public.invoices');

create table public.invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  student_fee_id  uuid references public.student_fees(id) on delete set null,
  fee_category_id uuid references public.fee_categories(id) on delete set null,
  label           text not null,
  quantity        numeric(8,2) not null default 1,
  unit_amount     numeric(12,2) not null,
  amount          numeric(12,2) generated always as (quantity * unit_amount) stored,

  constraint invoice_lines_quantity_positive check (quantity > 0)
);

create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

-- -----------------------------------------------------------------------------
-- Paiements et affectations
-- -----------------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  invoice_id       uuid references public.invoices(id) on delete set null,
  receipt_number   text not null,
  amount           numeric(12,2) not null,
  currency         text not null default 'EUR',
  method           public.payment_method not null default 'cash',
  reference        text,
  paid_at          timestamptz not null default now(),
  received_by      uuid references public.profiles(id) on delete set null,
  notes            text,
  status           public.payment_status not null default 'confirmed',
  receipt_pdf_path text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint payments_receipt_unique unique (school_id, receipt_number),
  constraint payments_amount_positive check (amount > 0)
);

create index payments_student_idx on public.payments (student_id, paid_at desc);
create index payments_school_date_idx on public.payments (school_id, paid_at desc);

select private.attach_updated_at('public.payments');

create table public.payment_allocations (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  payment_id      uuid not null references public.payments(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete cascade,
  amount          numeric(12,2) not null,

  constraint payment_allocations_unique unique (payment_id, invoice_line_id),
  constraint payment_allocations_amount_positive check (amount > 0)
);

create index payment_allocations_line_idx on public.payment_allocations (invoice_line_id);

create table public.payment_reminders (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  invoice_id  uuid references public.invoices(id) on delete cascade,
  channel     public.reminder_channel not null default 'email',
  template    text,
  sent_to     text,
  sent_at     timestamptz not null default now(),
  status      text not null default 'sent',
  error       text
);

create index payment_reminders_invoice_idx on public.payment_reminders (invoice_id, sent_at desc);

-- =============================================================================
-- Coherence des montants
-- =============================================================================

-- Une affectation ne peut pas depasser ni le paiement, ni le reste du a la ligne.
create or replace function public.check_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_total   numeric;
  v_payment_amount  numeric;
  v_line_amount     numeric;
  v_line_allocated  numeric;
begin
  select p.amount into v_payment_amount from public.payments p where p.id = new.payment_id;

  select coalesce(sum(a.amount), 0) into v_payment_total
  from public.payment_allocations a
  where a.payment_id = new.payment_id and a.id is distinct from new.id;

  if v_payment_total + new.amount > v_payment_amount + 0.001 then
    raise exception 'Affectation de % impossible : le paiement ne dispose plus que de %.',
      new.amount, v_payment_amount - v_payment_total
      using errcode = '23514';
  end if;

  select l.amount into v_line_amount from public.invoice_lines l where l.id = new.invoice_line_id;

  select coalesce(sum(a.amount), 0) into v_line_allocated
  from public.payment_allocations a
  where a.invoice_line_id = new.invoice_line_id and a.id is distinct from new.id;

  if v_line_allocated + new.amount > v_line_amount + 0.001 then
    raise exception 'Affectation de % impossible : il ne reste que % a payer sur cette ligne.',
      new.amount, v_line_amount - v_line_allocated
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger payment_allocations_check
  before insert or update on public.payment_allocations
  for each row execute function public.check_payment_allocation();

-- Le montant paye d'une facture est un resultat, jamais une saisie.
create or replace function public.refresh_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice uuid;
  v_total   numeric;
  v_paid    numeric;
  v_due     date;
begin
  select l.invoice_id into v_invoice
  from public.invoice_lines l
  where l.id = coalesce(new.invoice_line_id, old.invoice_line_id);

  if v_invoice is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(l.amount), 0) into v_total
  from public.invoice_lines l where l.invoice_id = v_invoice;

  select coalesce(sum(a.amount), 0) into v_paid
  from public.payment_allocations a
  join public.invoice_lines l on l.id = a.invoice_line_id
  join public.payments p on p.id = a.payment_id
  where l.invoice_id = v_invoice and p.status = 'confirmed';

  select due_date into v_due from public.invoices where id = v_invoice;

  update public.invoices
     set total_amount = v_total,
         paid_amount  = v_paid,
         -- Chaque branche est typee : dans un CASE, des litteraux non
         -- qualifies se resolvent en text et le cast implicite vers l'enum
         -- n'a pas lieu.
         status = case
           when status = 'cancelled' then 'cancelled'::public.invoice_status
           when v_paid >= v_total and v_total > 0 then 'paid'::public.invoice_status
           when v_paid > 0 then 'partially_paid'::public.invoice_status
           when v_due < current_date then 'overdue'::public.invoice_status
           when status = 'draft' then 'draft'::public.invoice_status
           else 'issued'::public.invoice_status
         end
   where id = v_invoice;

  return coalesce(new, old);
end;
$$;

create trigger payment_allocations_refresh_invoice
  after insert or update or delete on public.payment_allocations
  for each row execute function public.refresh_invoice_totals();

-- Idem quand les lignes changent.
create or replace function public.refresh_invoice_from_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_total   numeric;
begin
  select coalesce(sum(l.amount), 0) into v_total
  from public.invoice_lines l where l.invoice_id = v_invoice;

  update public.invoices set total_amount = v_total where id = v_invoice;
  return coalesce(new, old);
end;
$$;

create trigger invoice_lines_refresh
  after insert or update or delete on public.invoice_lines
  for each row execute function public.refresh_invoice_from_lines();

-- Numerotation automatique
create or replace function public.assign_finance_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'invoices' then
    if new.number is null or length(trim(new.number)) = 0 then
      new.number := public.next_number(new.school_id, 'invoice');
    end if;
  else
    if new.receipt_number is null or length(trim(new.receipt_number)) = 0 then
      new.receipt_number := public.next_number(new.school_id, 'receipt');
    end if;
  end if;
  return new;
end;
$$;

create trigger invoices_assign_number
  before insert on public.invoices
  for each row execute function public.assign_finance_number();

create trigger payments_assign_number
  before insert on public.payments
  for each row execute function public.assign_finance_number();

-- =============================================================================
-- Fonctions metier
-- =============================================================================

-- Applique la grille tarifaire a un eleve, par specificite decroissante.
create or replace function public.assign_fees_to_student(
  p_student_id uuid,
  p_year_id    uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school  uuid;
  v_class   uuid;
  v_level   uuid;
  v_program uuid;
  v_count   integer := 0;
begin
  select s.school_id into v_school from public.students s where s.id = p_student_id;

  if not private.is_school_admin(v_school)
     and not private.has_role(v_school, array['accountant']::public.user_role[]) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  select e.class_id, c.level_id, c.program_id
    into v_class, v_level, v_program
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  where e.student_id = p_student_id
    and e.academic_year_id = p_year_id
    and e.status = 'active';

  -- Une seule grille par categorie : la plus specifique l'emporte.
  insert into public.student_fees (
    school_id, student_id, academic_year_id, fee_structure_id, fee_category_id, amount_due
  )
  select distinct on (f.fee_category_id)
         v_school, p_student_id, p_year_id, f.id, f.fee_category_id, f.amount
  from public.fee_structures f
  where f.school_id = v_school
    and f.academic_year_id = p_year_id
    and f.is_active
    and (f.class_id   = v_class   or f.class_id   is null)
    and (f.program_id = v_program or f.program_id is null)
    and (f.level_id   = v_level   or f.level_id   is null)
  order by f.fee_category_id,
           (f.class_id is not null) desc,
           (f.program_id is not null) desc,
           (f.level_id is not null) desc
  on conflict (student_id, academic_year_id, fee_category_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.assign_fees_to_student(uuid, uuid) to authenticated;

-- Emet une facture couvrant les frais non encore factures d'un eleve.
create or replace function public.issue_invoice(
  p_student_id uuid,
  p_year_id    uuid,
  p_due_date   date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school   uuid;
  v_currency text;
  v_invoice  uuid;
  v_lines    integer;
begin
  select s.school_id into v_school from public.students s where s.id = p_student_id;

  if not private.is_school_admin(v_school)
     and not private.has_role(v_school, array['accountant']::public.user_role[]) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  select currency into v_currency from public.schools where id = v_school;

  insert into public.invoices (
    school_id, student_id, academic_year_id, due_date, currency, status, created_by
  )
  values (
    v_school, p_student_id, p_year_id,
    coalesce(p_due_date, current_date + 30), v_currency, 'issued', (select auth.uid())
  )
  returning id into v_invoice;

  insert into public.invoice_lines (
    school_id, invoice_id, student_fee_id, fee_category_id, label, quantity, unit_amount
  )
  select v_school, v_invoice, sf.id, sf.fee_category_id, fc.name, 1, sf.net_due
  from public.student_fees sf
  join public.fee_categories fc on fc.id = sf.fee_category_id
  where sf.student_id = p_student_id
    and sf.academic_year_id = p_year_id
    and sf.status <> 'waived'
    and not exists (
      select 1 from public.invoice_lines l
      join public.invoices i on i.id = l.invoice_id
      where l.student_fee_id = sf.id and i.status <> 'cancelled'
    );

  get diagnostics v_lines = row_count;

  if v_lines = 0 then
    delete from public.invoices where id = v_invoice;
    raise exception 'Aucun frais restant a facturer pour cet eleve.' using errcode = 'P0002';
  end if;

  return v_invoice;
end;
$$;

grant execute on function public.issue_invoice(uuid, uuid, date) to authenticated;

-- Enregistre un versement et l'impute sur les lignes les plus anciennes.
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount     numeric,
  p_method     public.payment_method default 'cash',
  p_reference  text default null,
  p_paid_at    timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school    uuid;
  v_student   uuid;
  v_payment   uuid;
  v_remaining numeric := p_amount;
  v_line      record;
  v_take      numeric;
begin
  select school_id, student_id into v_school, v_student
  from public.invoices where id = p_invoice_id;

  if v_school is null then
    raise exception 'Facture introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school)
     and not private.has_role(v_school, array['accountant']::public.user_role[]) then
    raise exception 'Seule la comptabilite peut enregistrer un paiement.' using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'Le montant doit etre positif.' using errcode = '23514';
  end if;

  insert into public.payments (
    school_id, student_id, invoice_id, amount, method, reference, paid_at, received_by
  )
  values (v_school, v_student, p_invoice_id, p_amount, p_method, p_reference, p_paid_at,
          (select auth.uid()))
  returning id into v_payment;

  -- Imputation ligne a ligne, dans l'ordre de creation : un versement partiel
  -- solde les premieres lignes avant d'entamer les suivantes.
  for v_line in
    select l.id,
           l.amount - coalesce((
             select sum(a.amount) from public.payment_allocations a
             where a.invoice_line_id = l.id
           ), 0) as remaining
    from public.invoice_lines l
    where l.invoice_id = p_invoice_id
    order by l.id
  loop
    exit when v_remaining <= 0;
    continue when v_line.remaining <= 0;

    v_take := least(v_remaining, v_line.remaining);

    insert into public.payment_allocations (school_id, payment_id, invoice_line_id, amount)
    values (v_school, v_payment, v_line.id, v_take);

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0.001 then
    raise exception 'Le versement depasse de % le solde de la facture.', v_remaining
      using errcode = '23514';
  end if;

  return v_payment;
end;
$$;

grant execute on function public.record_payment(uuid, numeric, public.payment_method, text, timestamptz)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Soldes et impayes
-- -----------------------------------------------------------------------------
create view public.student_balances
with (security_invoker = true) as
  select i.school_id,
         i.student_id,
         i.academic_year_id,
         s.full_name,
         s.matricule,
         sum(i.total_amount)                                            as total_invoiced,
         sum(i.paid_amount)                                             as total_paid,
         sum(i.balance)                                                 as balance,
         min(i.due_date) filter (where i.balance > 0)                   as oldest_due_date,
         max(current_date - i.due_date) filter (where i.balance > 0)    as days_overdue,
         count(*) filter (where i.balance > 0 and i.due_date < current_date) as overdue_invoices
  from public.invoices i
  join public.students s on s.id = i.student_id
  where i.status <> 'cancelled'
  group by i.school_id, i.student_id, i.academic_year_id, s.full_name, s.matricule;

grant select on public.student_balances to authenticated;

-- Recettes par mois, pour les tableaux de bord.
create view public.monthly_revenue
with (security_invoker = true) as
  select p.school_id,
         date_trunc('month', p.paid_at)::date as month,
         sum(p.amount)                        as amount,
         count(*)                             as payment_count
  from public.payments p
  where p.status = 'confirmed'
  group by p.school_id, date_trunc('month', p.paid_at);

grant select on public.monthly_revenue to authenticated;

-- =============================================================================
-- RLS
--
-- La comptabilite ecrit ; l'administration lit et ecrit ; l'eleve et son parent
-- consultent leur propre dossier.
-- =============================================================================
create or replace function private.can_manage_finance(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_school_admin(p_school)
      or private.has_role(p_school, array['accountant']::public.user_role[])
$$;

grant execute on function private.can_manage_finance(uuid) to authenticated;

-- Referentiels tarifaires : lisibles par l'administration et la comptabilite.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'fee_categories', 'fee_structures', 'fee_installments', 'scholarships'
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
         using (private.can_manage_finance(school_id))
         with check (private.can_manage_finance(school_id))',
      v_table || '_write', v_table
    );
    execute format('select private.grant_crud(''public.%I'')', v_table);
  end loop;
end
$$;

-- Dossiers financiers : perimetre eleve.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['student_fees', 'invoices', 'payments', 'payment_reminders']
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (
           private.can_manage_finance(school_id)
           or student_id = any (private.my_student_ids())
         )',
      v_table || '_select', v_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (private.can_manage_finance(school_id))
         with check (private.can_manage_finance(school_id))',
      v_table || '_write', v_table
    );
    execute format('select private.grant_crud(''public.%I'')', v_table);
  end loop;
end
$$;

-- Lignes et affectations : visibles avec la facture ou le paiement qu'elles
-- detaillent.
alter table public.invoice_lines enable row level security;

create policy invoice_lines_select on public.invoice_lines
  for select to authenticated
  using (
    private.can_manage_finance(school_id)
    or invoice_id in (
      select i.id from public.invoices i
      where i.student_id = any (private.my_student_ids())
    )
  );

create policy invoice_lines_write on public.invoice_lines
  for all to authenticated
  using (private.can_manage_finance(school_id))
  with check (private.can_manage_finance(school_id));

select private.grant_crud('public.invoice_lines');

alter table public.payment_allocations enable row level security;

create policy payment_allocations_select on public.payment_allocations
  for select to authenticated
  using (
    private.can_manage_finance(school_id)
    or payment_id in (
      select p.id from public.payments p
      where p.student_id = any (private.my_student_ids())
    )
  );

create policy payment_allocations_write on public.payment_allocations
  for all to authenticated
  using (private.can_manage_finance(school_id))
  with check (private.can_manage_finance(school_id));

select private.grant_crud('public.payment_allocations');

select private.attach_audit('public.payments');
select private.attach_audit('public.invoices');

