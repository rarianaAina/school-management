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
