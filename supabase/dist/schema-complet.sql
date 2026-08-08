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

