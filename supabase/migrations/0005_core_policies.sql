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
