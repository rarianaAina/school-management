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
