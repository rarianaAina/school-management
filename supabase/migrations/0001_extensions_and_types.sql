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
