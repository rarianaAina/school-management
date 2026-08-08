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
