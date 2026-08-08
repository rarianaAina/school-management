-- =============================================================================
-- 0015 — Notes, moyennes et bulletins
--
-- Une seule chaine de saisie (assessments -> grades -> moyenne par matiere),
-- deux restitutions selon schools.settings->grading->>mode :
--   weighted_average — moyenne generale ponderee par coefficient, rang
--   ects             — unites d'enseignement, credits, compensation
--
-- Les vues calculent en direct pour la saisie et les tableaux de bord ; les
-- tables term_*_results figent le resultat a la publication. Un bulletin remis
-- ne doit pas changer si un coefficient est corrige six mois plus tard.
-- =============================================================================

create type public.study_unit_kind as enum (
  'fundamental', 'methodology', 'discovery', 'transversal', 'other'
);

create type public.validation_mode as enum ('direct', 'compensation', 'resit');

-- -----------------------------------------------------------------------------
-- Types d'evaluation (devoir, controle continu, examen...)
-- -----------------------------------------------------------------------------
create table public.assessment_types (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  name           text not null,
  code           text,
  default_weight numeric(4,2) not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint assessment_types_unique_name unique (school_id, name),
  constraint assessment_types_weight_positive check (default_weight > 0)
);

select private.attach_updated_at('public.assessment_types');

-- -----------------------------------------------------------------------------
-- Evaluations
-- -----------------------------------------------------------------------------
create table public.assessments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  class_subject_id   uuid not null references public.class_subjects(id) on delete cascade,
  term_id            uuid not null references public.terms(id) on delete cascade,
  assessment_type_id uuid references public.assessment_types(id) on delete set null,
  title              text not null,
  description        text,
  date               date not null default current_date,
  max_score          numeric(5,2) not null default 20,
  weight             numeric(4,2) not null default 1,
  is_published       boolean not null default false,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint assessments_max_score_positive check (max_score > 0),
  constraint assessments_weight_positive check (weight > 0)
);

create index assessments_class_subject_idx on public.assessments (class_subject_id, term_id);
create index assessments_term_idx on public.assessments (school_id, term_id);

select private.attach_updated_at('public.assessments');

comment on column public.assessments.weight is
  'Poids de l''evaluation dans la moyenne de la matiere. Distinct du coefficient de la matiere.';

-- -----------------------------------------------------------------------------
-- Notes
--
-- score null = non saisi ; is_absent distingue l'absence d'un zero. Une absence
-- justifiee sort du calcul, une absence non justifiee compte comme zero.
-- -----------------------------------------------------------------------------
create table public.grades (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  score          numeric(5,2),
  is_absent      boolean not null default false,
  is_excused     boolean not null default false,
  comment        text,
  graded_by      uuid references public.profiles(id) on delete set null,
  graded_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint grades_unique unique (assessment_id, student_id),
  constraint grades_score_positive check (score is null or score >= 0)
);

create index grades_student_idx on public.grades (student_id);
create index grades_assessment_idx on public.grades (assessment_id);

select private.attach_updated_at('public.grades');

-- La note ne peut pas depasser le bareme de son evaluation.
create or replace function public.check_grade_bounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max    numeric;
  v_locked boolean;
begin
  select a.max_score, t.is_locked
    into v_max, v_locked
  from public.assessments a
  join public.terms t on t.id = a.term_id
  where a.id = new.assessment_id;

  if new.score is not null and new.score > v_max then
    raise exception 'Note % superieure au bareme de l''evaluation (%).', new.score, v_max
      using errcode = '23514';
  end if;

  -- Le verrouillage de periode s'applique a tous sauf a l'administration.
  if v_locked and not private.is_school_admin(new.school_id) then
    raise exception 'Cette periode est verrouillee : la saisie de notes y est close.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger grades_check_bounds
  before insert or update on public.grades
  for each row execute function public.check_grade_bounds();

create trigger grades_same_school
  before insert or update on public.grades
  for each row execute function public.check_same_school(
    'assessment_id', 'assessments',
    'student_id', 'students'
  );

-- -----------------------------------------------------------------------------
-- Unites d'enseignement — mode ECTS uniquement. Vides ailleurs, sans qu'aucune
-- autre partie du schema n'ait a s'en soucier.
-- -----------------------------------------------------------------------------
create table public.study_units (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years(id) on delete cascade,
  term_id           uuid references public.terms(id) on delete cascade,
  level_id          uuid references public.levels(id) on delete set null,
  program_id        uuid references public.programs(id) on delete set null,
  code              text not null,
  name              text not null,
  credits           numeric(4,1) not null,
  kind              public.study_unit_kind not null default 'fundamental',
  is_compulsory     boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint study_units_unique_code unique (school_id, academic_year_id, code),
  constraint study_units_credits_positive check (credits > 0)
);

select private.attach_updated_at('public.study_units');

create table public.study_unit_subjects (
  school_id        uuid not null references public.schools(id) on delete cascade,
  study_unit_id    uuid not null references public.study_units(id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  weight           numeric(4,2) not null default 1,

  primary key (study_unit_id, class_subject_id),
  constraint study_unit_subjects_weight_positive check (weight > 0)
);

-- Une matiere n'appartient qu'a une seule UE.
create unique index study_unit_subjects_one_unit
  on public.study_unit_subjects (class_subject_id);

-- =============================================================================
-- Calcul en direct
-- =============================================================================

-- Moyenne par eleve, matiere et periode, ramenee au bareme de l'etablissement.
create view public.subject_averages
with (security_invoker = true) as
  select g.student_id,
         a.class_subject_id,
         a.term_id,
         cs.class_id,
         cs.school_id,
         cs.subject_id,
         cs.coefficient,
         cs.credits,
         round(
           sum(
             case when g.is_absent and not g.is_excused then 0
                  else g.score / a.max_score * coalesce((s.settings #>> '{grading,scale}')::numeric, 20)
             end * a.weight
           ) / nullif(sum(a.weight), 0)
         , 2) as average,
         count(*) filter (where g.score is not null or g.is_absent) as graded_count
  from public.grades g
  join public.assessments a on a.id = g.assessment_id
  join public.class_subjects cs on cs.id = a.class_subject_id
  join public.schools s on s.id = cs.school_id
  -- Une absence justifiee ne compte pas : elle sortirait la moyenne du reel.
  where not (g.is_absent and g.is_excused)
    and (g.score is not null or g.is_absent)
  group by g.student_id, a.class_subject_id, a.term_id,
           cs.class_id, cs.school_id, cs.subject_id, cs.coefficient, cs.credits;

grant select on public.subject_averages to authenticated;

-- Moyenne generale ponderee et rang dans la classe (mode /20).
create view public.term_averages
with (security_invoker = true) as
  select sa.student_id,
         sa.class_id,
         sa.school_id,
         sa.term_id,
         round(sum(sa.average * sa.coefficient) / nullif(sum(sa.coefficient), 0), 2) as general_average,
         sum(sa.coefficient) as total_coefficient,
         count(*) as subject_count,
         rank() over (
           partition by sa.class_id, sa.term_id
           order by sum(sa.average * sa.coefficient) / nullif(sum(sa.coefficient), 0) desc
         ) as rank
  from public.subject_averages sa
  group by sa.student_id, sa.class_id, sa.school_id, sa.term_id;

grant select on public.term_averages to authenticated;

-- Moyenne par UE et credits (mode ECTS).
create view public.unit_averages
with (security_invoker = true) as
  select sa.student_id,
         su.id   as study_unit_id,
         su.school_id,
         su.term_id,
         sa.class_id,
         su.credits,
         round(sum(sa.average * sus.weight) / nullif(sum(sus.weight), 0), 2) as average
  from public.subject_averages sa
  join public.study_unit_subjects sus on sus.class_subject_id = sa.class_subject_id
  join public.study_units su on su.id = sus.study_unit_id
  group by sa.student_id, su.id, su.school_id, su.term_id, sa.class_id, su.credits;

grant select on public.unit_averages to authenticated;

-- =============================================================================
-- Instantanes figes a la publication
-- =============================================================================
create table public.term_subject_results (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  term_id          uuid not null references public.terms(id) on delete cascade,
  average          numeric(5,2),
  coefficient      numeric(4,2) not null default 1,
  rank             integer,
  class_average    numeric(5,2),
  class_min        numeric(5,2),
  class_max        numeric(5,2),
  teacher_comment  text,
  computed_at      timestamptz not null default now(),

  constraint term_subject_results_unique unique (student_id, class_subject_id, term_id)
);

create index term_subject_results_term_idx on public.term_subject_results (term_id, student_id);

create table public.term_unit_results (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  student_id      uuid not null references public.students(id) on delete cascade,
  study_unit_id   uuid not null references public.study_units(id) on delete cascade,
  term_id         uuid not null references public.terms(id) on delete cascade,
  average         numeric(5,2),
  credits         numeric(4,1) not null default 0,
  credits_earned  numeric(4,1) not null default 0,
  is_validated    boolean not null default false,
  validation_mode public.validation_mode,
  computed_at     timestamptz not null default now(),

  constraint term_unit_results_unique unique (student_id, study_unit_id, term_id)
);

create table public.term_results (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  class_id          uuid not null references public.classes(id) on delete cascade,
  term_id           uuid not null references public.terms(id) on delete cascade,
  general_average   numeric(5,2),
  rank              integer,
  class_size        integer,
  class_average     numeric(5,2),
  credits_earned    numeric(5,1),
  credits_required  numeric(5,1),
  decision          text,
  head_comment      text,
  absences_count    integer not null default 0,
  late_count        integer not null default 0,
  is_published      boolean not null default false,
  published_at      timestamptz,
  published_by      uuid references public.profiles(id) on delete set null,
  pdf_path          text,
  computed_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint term_results_unique unique (student_id, term_id)
);

create index term_results_term_idx on public.term_results (term_id, rank);

select private.attach_updated_at('public.term_results');

-- -----------------------------------------------------------------------------
-- compute_term_results — fige les resultats d'une classe pour une periode.
--
-- Lit le mode de notation de l'etablissement et applique la branche
-- correspondante. Le frontend ne connait pas ces regles : il lit les tables.
-- -----------------------------------------------------------------------------
create or replace function public.compute_term_results(p_class_id uuid, p_term_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school       uuid;
  v_mode         text;
  v_passing      numeric;
  v_compensation boolean;
  v_floor        numeric;
  v_class_size   integer;
  v_count        integer := 0;
begin
  select c.school_id into v_school from public.classes c where c.id = p_class_id;

  if v_school is null then
    raise exception 'Classe introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school) then
    raise exception 'Seule l''administration peut arreter les resultats.' using errcode = '42501';
  end if;

  select s.settings #>> '{grading,mode}',
         coalesce((s.settings #>> '{grading,passing_score}')::numeric, 10),
         coalesce((s.settings #>> '{grading,compensation}')::boolean, false),
         coalesce((s.settings #>> '{grading,compensation_floor}')::numeric, 0)
    into v_mode, v_passing, v_compensation, v_floor
  from public.schools s where s.id = v_school;

  select count(*) into v_class_size
  from public.enrollments e
  where e.class_id = p_class_id and e.status = 'active';

  -- 1. Resultats par matiere, avec rang et statistiques de classe
  delete from public.term_subject_results
   where term_id = p_term_id
     and class_subject_id in (select id from public.class_subjects where class_id = p_class_id);

  insert into public.term_subject_results (
    school_id, student_id, class_subject_id, term_id, average, coefficient,
    rank, class_average, class_min, class_max
  )
  select v_school,
         sa.student_id,
         sa.class_subject_id,
         sa.term_id,
         sa.average,
         sa.coefficient,
         rank() over (partition by sa.class_subject_id order by sa.average desc),
         round(avg(sa.average) over (partition by sa.class_subject_id), 2),
         min(sa.average) over (partition by sa.class_subject_id),
         max(sa.average) over (partition by sa.class_subject_id)
  from public.subject_averages sa
  where sa.class_id = p_class_id and sa.term_id = p_term_id;

  -- 2. Resultats generaux
  delete from public.term_results where class_id = p_class_id and term_id = p_term_id;

  if v_mode = 'ects' then
    -- Moyenne du semestre ponderee par les credits, puis validation des UE.
    delete from public.term_unit_results
     where term_id = p_term_id
       and study_unit_id in (
         select distinct sus.study_unit_id
         from public.study_unit_subjects sus
         join public.class_subjects cs on cs.id = sus.class_subject_id
         where cs.class_id = p_class_id
       );

    with semester as (
      select ua.student_id,
             round(sum(ua.average * ua.credits) / nullif(sum(ua.credits), 0), 2) as average,
             sum(ua.credits) as credits_total
      from public.unit_averages ua
      where ua.class_id = p_class_id and ua.term_id = p_term_id
      group by ua.student_id
    ),
    validated as (
      select ua.student_id,
             ua.study_unit_id,
             ua.average,
             ua.credits,
             case
               when ua.average >= v_passing then 'direct'::public.validation_mode
               when v_compensation
                    and s.average >= v_passing
                    and ua.average >= v_floor then 'compensation'::public.validation_mode
               else null
             end as mode
      from public.unit_averages ua
      join semester s on s.student_id = ua.student_id
      where ua.class_id = p_class_id and ua.term_id = p_term_id
    )
    insert into public.term_unit_results (
      school_id, student_id, study_unit_id, term_id, average, credits,
      credits_earned, is_validated, validation_mode
    )
    select v_school, v.student_id, v.study_unit_id, p_term_id, v.average, v.credits,
           case when v.mode is not null then v.credits else 0 end,
           v.mode is not null,
           v.mode
    from validated v;

    insert into public.term_results (
      school_id, student_id, class_id, term_id, general_average, rank, class_size,
      class_average, credits_earned, credits_required
    )
    select v_school,
           t.student_id,
           p_class_id,
           p_term_id,
           t.average,
           rank() over (order by t.average desc),
           v_class_size,
           round(avg(t.average) over (), 2),
           coalesce(e.earned, 0),
           t.credits_total
    from (
      select ua.student_id,
             round(sum(ua.average * ua.credits) / nullif(sum(ua.credits), 0), 2) as average,
             sum(ua.credits) as credits_total
      from public.unit_averages ua
      where ua.class_id = p_class_id and ua.term_id = p_term_id
      group by ua.student_id
    ) t
    left join (
      select student_id, sum(credits_earned) as earned
      from public.term_unit_results
      where term_id = p_term_id
      group by student_id
    ) e on e.student_id = t.student_id;

  else
    insert into public.term_results (
      school_id, student_id, class_id, term_id, general_average, rank, class_size,
      class_average, decision
    )
    select v_school,
           ta.student_id,
           p_class_id,
           p_term_id,
           ta.general_average,
           ta.rank,
           v_class_size,
           round(avg(ta.general_average) over (), 2),
           case when ta.general_average >= v_passing then 'admis' else 'insuffisant' end
    from public.term_averages ta
    where ta.class_id = p_class_id and ta.term_id = p_term_id;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.compute_term_results(uuid, uuid) to authenticated;

-- Publication : rend les bulletins visibles aux eleves et aux parents.
create or replace function public.publish_term_results(p_class_id uuid, p_term_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_count  integer;
begin
  select school_id into v_school from public.classes where id = p_class_id;

  if not private.is_school_admin(v_school) then
    raise exception 'Seule l''administration peut publier les bulletins.' using errcode = '42501';
  end if;

  update public.term_results
     set is_published = true,
         published_at = now(),
         published_by = (select auth.uid())
   where class_id = p_class_id and term_id = p_term_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.publish_term_results(uuid, uuid) to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.assessment_types enable row level security;
create policy assessment_types_select on public.assessment_types
  for select to authenticated using (private.is_school_member(school_id));
create policy assessment_types_write on public.assessment_types
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.assessment_types');

-- Evaluations : l'enseignant gere celles de ses matieres.
alter table public.assessments enable row level security;

create policy assessments_select on public.assessments
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or class_subject_id in (
      select cs.id from public.class_subjects cs
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
    -- Eleves et parents ne voient que les evaluations publiees de leur classe.
    or (is_published and class_subject_id in (
      select cs.id from public.class_subjects cs
      join public.enrollments e on e.class_id = cs.class_id
      where e.student_id = any (private.my_student_ids()) and e.status = 'active'
    ))
  );

create policy assessments_write_teacher on public.assessments
  for all to authenticated
  using (
    class_subject_id in (
      select cs.id from public.class_subjects cs
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  )
  with check (
    class_subject_id in (
      select cs.id from public.class_subjects cs
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  );

create policy assessments_write_admin on public.assessments
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));

select private.grant_crud('public.assessments');

-- Notes
alter table public.grades enable row level security;

create policy grades_select on public.grades
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or assessment_id in (
      select a.id from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
    or (student_id = any (private.my_student_ids())
        and assessment_id in (select id from public.assessments where is_published))
  );

create policy grades_write_teacher on public.grades
  for all to authenticated
  using (
    assessment_id in (
      select a.id from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  )
  with check (
    assessment_id in (
      select a.id from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      join public.teachers t on t.id = cs.teacher_id
      where t.profile_id = (select auth.uid())
    )
  );

create policy grades_write_admin on public.grades
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));

select private.grant_crud('public.grades');
select private.attach_audit('public.grades');

-- Unites d'enseignement
alter table public.study_units enable row level security;
create policy study_units_select on public.study_units
  for select to authenticated using (private.is_school_member(school_id));
create policy study_units_write on public.study_units
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.study_units');

alter table public.study_unit_subjects enable row level security;
create policy study_unit_subjects_select on public.study_unit_subjects
  for select to authenticated using (private.is_school_member(school_id));
create policy study_unit_subjects_write on public.study_unit_subjects
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.study_unit_subjects');

-- Resultats figes : lecture par l'administration, l'enseignant de la classe,
-- et par l'eleve ou son parent une fois publies.
alter table public.term_subject_results enable row level security;
create policy term_subject_results_select on public.term_subject_results
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.taught_student_ids())
    or (student_id = any (private.my_student_ids())
        and exists (select 1 from public.term_results tr
                    where tr.student_id = term_subject_results.student_id
                      and tr.term_id = term_subject_results.term_id
                      and tr.is_published))
  );
create policy term_subject_results_write on public.term_subject_results
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.term_subject_results');

alter table public.term_unit_results enable row level security;
create policy term_unit_results_select on public.term_unit_results
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.my_student_ids())
    or student_id = any (private.taught_student_ids())
  );
create policy term_unit_results_write on public.term_unit_results
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.term_unit_results');

alter table public.term_results enable row level security;
create policy term_results_select on public.term_results
  for select to authenticated
  using (
    private.is_school_staff(school_id)
    or student_id = any (private.taught_student_ids())
    or (student_id = any (private.my_student_ids()) and is_published)
  );
create policy term_results_write on public.term_results
  for all to authenticated
  using (private.is_school_admin(school_id)) with check (private.is_school_admin(school_id));
select private.grant_crud('public.term_results');
