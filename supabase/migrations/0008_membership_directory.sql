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
