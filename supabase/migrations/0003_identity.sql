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
