-- =============================================================================
-- Schema complet — genere par concatenation de supabase/migrations/*.sql
-- A executer tel quel dans Supabase Studio > SQL Editor sur un projet vierge.
-- Alternative recommandee : supabase link --project-ref <ref> && supabase db push
-- =============================================================================

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

