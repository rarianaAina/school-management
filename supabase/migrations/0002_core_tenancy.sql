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
