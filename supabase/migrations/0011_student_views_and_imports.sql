-- =============================================================================
-- 0011 — Vues de consultation et imports en masse
-- =============================================================================

-- -----------------------------------------------------------------------------
-- student_overview — une ligne par (eleve, annee scolaire).
--
-- security_invoker = true : la vue herite de la RLS de `students`, si bien que
-- chaque role y voit exactement le meme perimetre que sur la table de base.
-- Filtrer sur academic_year_id cote client donne une ligne par eleve.
-- -----------------------------------------------------------------------------
create view public.student_overview
with (security_invoker = true) as
  select s.id,
         s.school_id,
         s.profile_id,
         s.matricule,
         s.first_name,
         s.last_name,
         s.full_name,
         s.birth_date,
         s.gender,
         s.photo_url,
         s.email,
         s.phone,
         s.city,
         s.status,
         s.entry_date,
         s.created_at,
         e.id               as enrollment_id,
         e.status           as enrollment_status,
         e.is_repeating,
         e.enrolled_at,
         e.academic_year_id,
         c.id               as class_id,
         c.name             as class_name,
         l.id               as level_id,
         l.name             as level_name,
         p.id               as program_id,
         p.name             as program_name
  from public.students s
  left join public.enrollments e
    on e.student_id = s.id and e.status = 'active'
  left join public.classes c on c.id = e.class_id
  left join public.levels l on l.id = c.level_id
  left join public.programs p on p.id = c.program_id
  where s.deleted_at is null;

grant select on public.student_overview to authenticated;

comment on view public.student_overview is
  'Eleve + inscription active + classe/niveau/filiere. Une ligne par annee scolaire ; filtrer sur academic_year_id.';

-- -----------------------------------------------------------------------------
-- class_overview — effectifs et taux de remplissage.
--
-- security_invoker = false ici, a l'inverse : les effectifs doivent etre exacts
-- pour tout membre autorise a voir la classe. Sous RLS invoker, un eleve ne
-- comptant que sa propre inscription aurait vu "1 eleve" partout.
-- -----------------------------------------------------------------------------
create view public.class_overview
with (security_invoker = false) as
  select c.id,
         c.school_id,
         c.academic_year_id,
         c.name,
         c.code,
         c.capacity,
         c.level_id,
         c.program_id,
         c.main_teacher_id,
         c.default_room_id,
         c.created_at,
         l.name  as level_name,
         l.cycle as level_cycle,
         l.order_index as level_order,
         p.name  as program_name,
         t.full_name as main_teacher_name,
         r.name  as default_room_name,
         (select count(*) from public.enrollments e
           where e.class_id = c.id and e.status = 'active')     as enrolled_count,
         (select count(*) from public.class_subjects cs
           where cs.class_id = c.id)                            as subject_count,
         case
           when c.capacity is null or c.capacity = 0 then null
           else round(
             (select count(*) from public.enrollments e
               where e.class_id = c.id and e.status = 'active')::numeric
             * 100 / c.capacity, 1)
         end                                                    as fill_rate
  from public.classes c
  join public.levels l on l.id = c.level_id
  left join public.programs p on p.id = c.program_id
  left join public.teachers t on t.id = c.main_teacher_id
  left join public.rooms r on r.id = c.default_room_id
  where private.is_school_member(c.school_id);

grant select on public.class_overview to authenticated;

comment on view public.class_overview is
  'Classes avec effectif inscrit, nombre de matieres et taux de remplissage.';

-- -----------------------------------------------------------------------------
-- import_jobs — trace des imports CSV/Excel et de leurs erreurs ligne a ligne
-- -----------------------------------------------------------------------------
create type public.import_status as enum ('pending', 'processing', 'completed', 'failed');

create table public.import_jobs (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  entity        text not null,          -- 'students' | 'teachers' | 'guardians'
  filename      text not null,
  storage_path  text,
  status        public.import_status not null default 'pending',
  total_rows    integer not null default 0,
  success_rows  integer not null default 0,
  error_rows    integer not null default 0,
  errors        jsonb not null default '[]'::jsonb,
  options       jsonb not null default '{}'::jsonb,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint import_jobs_entity_values check (entity in ('students', 'teachers', 'guardians'))
);

create index import_jobs_school_idx on public.import_jobs (school_id, created_at desc);

select private.attach_updated_at('public.import_jobs');

alter table public.import_jobs enable row level security;

create policy import_jobs_select on public.import_jobs
  for select to authenticated
  using (private.is_school_admin(school_id));

create policy import_jobs_write on public.import_jobs
  for all to authenticated
  using (private.is_school_admin(school_id))
  with check (private.is_school_admin(school_id));

select private.grant_crud('public.import_jobs');

-- -----------------------------------------------------------------------------
-- enroll_students — inscrit un lot d'eleves dans une classe.
--
-- Regroupe en une transaction la cloture de l'inscription active precedente et
-- la creation de la nouvelle : evite l'echec de l'index partiel
-- enrollments_one_active_per_year lors d'un changement de classe.
-- -----------------------------------------------------------------------------
create or replace function public.enroll_students(
  p_class_id     uuid,
  p_student_ids  uuid[],
  p_is_repeating boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_year   uuid;
  v_count  integer := 0;
begin
  select school_id, academic_year_id into v_school, v_year
  from public.classes where id = p_class_id;

  if v_school is null then
    raise exception 'Classe introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school) then
    raise exception 'Seule l''administration peut inscrire un eleve.' using errcode = '42501';
  end if;

  -- Cloture des inscriptions actives de la meme annee, hors classe cible.
  update public.enrollments e
  set status = 'transferred', withdrawn_at = current_date
  where e.student_id = any (p_student_ids)
    and e.academic_year_id = v_year
    and e.status = 'active'
    and e.class_id <> p_class_id;

  insert into public.enrollments (school_id, student_id, class_id, academic_year_id, is_repeating)
  select v_school, s.id, p_class_id, v_year, p_is_repeating
  from public.students s
  where s.id = any (p_student_ids)
    and s.school_id = v_school
    and s.deleted_at is null
  on conflict (student_id, class_id) do update
    set status = 'active', withdrawn_at = null, withdrawal_reason = null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.enroll_students(uuid, uuid[], boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- apply_subject_template — cree les matieres d'une classe a partir du modele
-- defini pour son niveau (subject_levels).
-- -----------------------------------------------------------------------------
create or replace function public.apply_subject_template(p_class_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_level  uuid;
  v_count  integer := 0;
begin
  select school_id, level_id into v_school, v_level
  from public.classes where id = p_class_id;

  if v_school is null then
    raise exception 'Classe introuvable.' using errcode = '23503';
  end if;

  if not private.is_school_admin(v_school) then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  insert into public.class_subjects (
    school_id, class_id, subject_id, coefficient, credits, max_score, weekly_hours
  )
  select v_school, p_class_id, sl.subject_id,
         sl.default_coefficient, sl.default_credits,
         sl.default_max_score, sl.default_weekly_hours
  from public.subject_levels sl
  where sl.level_id = v_level
    and sl.school_id = v_school
  on conflict (class_id, subject_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.apply_subject_template(uuid) to authenticated;
