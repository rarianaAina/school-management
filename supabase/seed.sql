-- =============================================================================
-- Jeu de donnees de demonstration (developpement local uniquement).
--
-- Deux etablissements aux modes de notation opposes :
--   - Lycee Victor Hugo   -> moyennes /20 ponderees, 3 trimestres
--   - Universite de Kasia -> credits ECTS, 2 semestres
--
-- Mot de passe commun : Demo1234!
-- =============================================================================

do $$
declare
  v_instance    uuid := '00000000-0000-0000-0000-000000000000';
  v_password    text := crypt('Demo1234!', gen_salt('bf'));
  v_lycee       uuid;
  v_univ        uuid;
  v_year_lycee  uuid;
  v_year_univ   uuid;

  v_admin       uuid := '10000000-0000-4000-a000-000000000001';
  v_teacher     uuid := '10000000-0000-4000-a000-000000000002';
  v_accountant  uuid := '10000000-0000-4000-a000-000000000003';
  v_parent      uuid := '10000000-0000-4000-a000-000000000004';
  v_student     uuid := '10000000-0000-4000-a000-000000000005';
  v_dean        uuid := '10000000-0000-4000-a000-000000000006';

  v_user        record;
begin
  -- ---------------------------------------------------------------------------
  -- Comptes Auth
  -- ---------------------------------------------------------------------------
  for v_user in
    select * from (values
      (v_admin,      'admin@lycee.test',      'Awa',      'Rakoto'),
      (v_teacher,    'prof@lycee.test',       'Hery',     'Randria'),
      (v_accountant, 'compta@lycee.test',     'Miora',    'Rasoa'),
      (v_parent,     'parent@lycee.test',     'Jean',     'Dupont'),
      (v_student,    'eleve@lycee.test',      'Lucas',    'Dupont'),
      (v_dean,       'doyen@universite.test', 'Fanja',    'Andria')
    ) as t(id, email, first_name, last_name)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      v_user.id, v_instance, 'authenticated', 'authenticated', v_user.email, v_password, now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('first_name', v_user.first_name, 'last_name', v_user.last_name),
      now(), now()
    )
    on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    values (
      gen_random_uuid(), v_user.id, v_user.id::text, 'email',
      jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
      now(), now(), now()
    )
    on conflict do nothing;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Lycee Victor Hugo — notation /20
  -- ---------------------------------------------------------------------------
  insert into public.schools (name, slug, type, email, phone, city, country, currency, timezone)
  values ('Lycee Victor Hugo', 'lycee-victor-hugo', 'high_school',
          'contact@lycee-victor-hugo.test', '+261 34 00 000 00',
          'Antananarivo', 'Madagascar', 'MGA', 'Indian/Antananarivo')
  returning id into v_lycee;

  update public.schools
  set settings = settings
    || jsonb_build_object('matricule_prefix', 'LVH')
    || jsonb_build_object('grading', settings -> 'grading' || jsonb_build_object('mode', 'weighted_average'))
  where id = v_lycee;

  insert into public.memberships (school_id, user_id, role, joined_at) values
    (v_lycee, v_admin,      'school_admin', now()),
    (v_lycee, v_teacher,    'teacher',      now()),
    (v_lycee, v_accountant, 'accountant',   now()),
    (v_lycee, v_parent,     'parent',       now()),
    (v_lycee, v_student,    'student',      now());

  insert into public.academic_years (school_id, name, start_date, end_date, is_current)
  values (v_lycee, '2025-2026', '2025-09-01', '2026-07-04', true)
  returning id into v_year_lycee;

  insert into public.terms (school_id, academic_year_id, name, kind, sequence, start_date, end_date, is_current) values
    (v_lycee, v_year_lycee, '1er trimestre', 'trimester', 1, '2025-09-01', '2025-12-19', true),
    (v_lycee, v_year_lycee, '2e trimestre',  'trimester', 2, '2025-12-20', '2026-03-27', false),
    (v_lycee, v_year_lycee, '3e trimestre',  'trimester', 3, '2026-03-28', '2026-07-04', false);

  insert into public.school_calendar (school_id, academic_year_id, name, type, start_date, end_date) values
    (v_lycee, v_year_lycee, 'Vacances de Noel',  'holiday', '2025-12-20', '2026-01-05'),
    (v_lycee, v_year_lycee, 'Vacances de Paques','holiday', '2026-04-04', '2026-04-19');

  insert into public.teachers (school_id, profile_id, employee_no, first_name, last_name, email, speciality, hire_date) values
    (v_lycee, v_teacher, 'ENS-001', 'Hery',  'Randria', 'prof@lycee.test',      'Mathematiques', '2019-09-01'),
    (v_lycee, null,      'ENS-002', 'Nirina','Rabe',    'n.rabe@lycee.test',    'Lettres',       '2021-09-01'),
    (v_lycee, null,      'ENS-003', 'Tovo',  'Rakotobe','t.rakotobe@lycee.test','Sciences physiques', '2020-09-01');

  -- ---------------------------------------------------------------------------
  -- Universite de Kasia — credits ECTS
  -- ---------------------------------------------------------------------------
  insert into public.schools (name, slug, type, email, city, country, currency, timezone)
  values ('Universite de Kasia', 'universite-kasia', 'university',
          'scolarite@universite-kasia.test', 'Antananarivo', 'Madagascar', 'MGA', 'Indian/Antananarivo')
  returning id into v_univ;

  update public.schools
  set settings = settings
    || jsonb_build_object('matricule_prefix', 'UK', 'terms_per_year', 2)
    || jsonb_build_object('grading', jsonb_build_object(
         'mode', 'ects', 'scale', 20, 'passing_score', 10,
         'compensation', true, 'compensation_floor', 7))
    || jsonb_build_object('vocabulary', jsonb_build_object(
         'class', 'Promotion', 'term', 'Semestre', 'subject', 'Element constitutif'))
  where id = v_univ;

  insert into public.memberships (school_id, user_id, role, joined_at) values
    (v_univ, v_dean,  'super_admin', now()),
    -- Meme personne, deux etablissements : valide le selecteur multi-tenant.
    (v_univ, v_admin, 'school_admin', now());

  insert into public.academic_years (school_id, name, start_date, end_date, is_current)
  values (v_univ, '2025-2026', '2025-10-01', '2026-06-30', true)
  returning id into v_year_univ;

  insert into public.terms (school_id, academic_year_id, name, kind, sequence, start_date, end_date, is_current) values
    (v_univ, v_year_univ, 'Semestre 1', 'semester', 1, '2025-10-01', '2026-02-15', true),
    (v_univ, v_year_univ, 'Semestre 2', 'semester', 2, '2026-02-16', '2026-06-30', false);

  insert into public.teachers (school_id, profile_id, employee_no, first_name, last_name, email, speciality, hire_date) values
    (v_univ, v_dean, 'UK-001', 'Fanja', 'Andria', 'doyen@universite.test', 'Informatique', '2015-10-01');

  raise notice 'Seed applique : % (/20) et % (ECTS).', v_lycee, v_univ;
end
$$;
