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
