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

-- =============================================================================
-- Module 2 — structure academique, eleves et inscriptions (Lycee Victor Hugo)
-- =============================================================================
do $$
declare
  v_lycee    uuid;
  v_year     uuid;
  v_seconde  uuid;
  v_premiere uuid;
  v_serie_s  uuid;
  v_prof_math uuid;
  v_prof_lettres uuid;
  v_salle_a  uuid;
  v_classe_2a uuid;
  v_classe_1s uuid;
  v_subject  record;
  v_student  record;
  v_student_id uuid;
  v_guardian uuid;
  v_i        integer;
begin
  -- next_number(), apply_subject_template() et enroll_students() verifient les
  -- droits de l'appelant via auth.uid(). Le seed s'execute sans session : on
  -- endosse l'identite de l'administrateur du lycee pour les traverser.
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',  '10000000-0000-4000-a000-000000000001',
      'role', 'authenticated'
    )::text,
    true
  );

  select id into v_lycee from public.schools where slug = 'lycee-victor-hugo';
  select id into v_year  from public.academic_years where school_id = v_lycee and is_current;
  select id into v_prof_math from public.teachers where school_id = v_lycee and employee_no = 'ENS-001';
  select id into v_prof_lettres from public.teachers where school_id = v_lycee and employee_no = 'ENS-002';

  -- Niveaux
  insert into public.levels (school_id, name, code, cycle, order_index) values
    (v_lycee, 'Seconde',   '2NDE', 'high', 1),
    (v_lycee, 'Premiere',  '1ERE', 'high', 2),
    (v_lycee, 'Terminale', 'TLE',  'high', 3);

  select id into v_seconde  from public.levels where school_id = v_lycee and code = '2NDE';
  select id into v_premiere from public.levels where school_id = v_lycee and code = '1ERE';

  -- Filiere
  insert into public.programs (school_id, name, code, level_id)
  values (v_lycee, 'Serie Scientifique', 'S', v_premiere)
  returning id into v_serie_s;

  -- Salles
  insert into public.rooms (school_id, name, code, building, capacity, type) values
    (v_lycee, 'Salle A1', 'A1', 'Batiment A', 35, 'classroom'),
    (v_lycee, 'Salle A2', 'A2', 'Batiment A', 35, 'classroom'),
    (v_lycee, 'Labo Sciences', 'LAB1', 'Batiment B', 24, 'lab');

  select id into v_salle_a from public.rooms where school_id = v_lycee and code = 'A1';

  -- Matieres
  insert into public.subjects (school_id, name, code, category) values
    (v_lycee, 'Mathematiques',      'MATH', 'Sciences'),
    (v_lycee, 'Francais',           'FR',   'Lettres'),
    (v_lycee, 'Physique-Chimie',    'PC',   'Sciences'),
    (v_lycee, 'Histoire-Geographie','HG',   'Sciences humaines'),
    (v_lycee, 'Anglais',            'ANG',  'Langues'),
    (v_lycee, 'SVT',                'SVT',  'Sciences'),
    (v_lycee, 'EPS',                'EPS',  'Sport');

  -- Modele de coefficients par niveau
  for v_subject in select id, code from public.subjects where school_id = v_lycee loop
    insert into public.subject_levels (school_id, subject_id, level_id, default_coefficient, default_weekly_hours)
    values (
      v_lycee, v_subject.id, v_seconde,
      case v_subject.code when 'MATH' then 5 when 'FR' then 4 when 'PC' then 4
                          when 'HG' then 3 when 'ANG' then 3 when 'SVT' then 3 else 1 end,
      case v_subject.code when 'MATH' then 5 when 'FR' then 4 else 2 end
    );

    insert into public.subject_levels (school_id, subject_id, level_id, default_coefficient, default_weekly_hours)
    values (
      v_lycee, v_subject.id, v_premiere,
      case v_subject.code when 'MATH' then 7 when 'PC' then 6 when 'SVT' then 5
                          when 'FR' then 3 when 'HG' then 2 when 'ANG' then 2 else 1 end,
      case v_subject.code when 'MATH' then 6 when 'PC' then 5 else 2 end
    );
  end loop;

  -- Classes
  insert into public.classes (school_id, academic_year_id, level_id, name, code, capacity, main_teacher_id, default_room_id)
  values (v_lycee, v_year, v_seconde, 'Seconde A', '2A', 32, v_prof_lettres, v_salle_a)
  returning id into v_classe_2a;

  insert into public.classes (school_id, academic_year_id, level_id, program_id, name, code, capacity, main_teacher_id)
  values (v_lycee, v_year, v_premiere, v_serie_s, 'Premiere S', '1S', 30, v_prof_math)
  returning id into v_classe_1s;

  -- Matieres des classes, depuis le modele de niveau
  perform public.apply_subject_template(v_classe_2a);
  perform public.apply_subject_template(v_classe_1s);

  -- Affectation des enseignants
  update public.class_subjects cs set teacher_id = v_prof_math
  from public.subjects s where s.id = cs.subject_id and s.code = 'MATH' and cs.school_id = v_lycee;

  update public.class_subjects cs set teacher_id = v_prof_lettres
  from public.subjects s where s.id = cs.subject_id and s.code = 'FR' and cs.school_id = v_lycee;

  -- Tuteur rattache au compte parent@lycee.test
  insert into public.guardians (school_id, profile_id, first_name, last_name, email, phone, profession)
  values (v_lycee, '10000000-0000-4000-a000-000000000004', 'Jean', 'Dupont',
          'parent@lycee.test', '+261 33 11 22 33', 'Ingenieur')
  returning id into v_guardian;

  -- Eleves : Lucas est rattache au compte eleve@lycee.test et au tuteur ci-dessus
  for v_student in
    select * from (values
      (1,  'Lucas',   'Dupont',    '2009-04-12', 'male',   true),
      (2,  'Emma',    'Rasoa',     '2009-07-03', 'female', false),
      (3,  'Noah',    'Randriana', '2009-01-25', 'male',   false),
      (4,  'Mia',     'Rakoto',    '2009-11-08', 'female', false),
      (5,  'Tiana',   'Ravelo',    '2008-03-17', 'female', false),
      (6,  'Sacha',   'Andrian',   '2008-09-30', 'male',   false),
      (7,  'Lina',    'Razaka',    '2008-06-21', 'female', false),
      (8,  'Ravo',    'Rabary',    '2008-12-02', 'male',   false)
    ) as t(n, first_name, last_name, birth_date, gender, is_lucas)
  loop
    insert into public.students (
      school_id, profile_id, first_name, last_name, birth_date, gender,
      city, entry_date, status
    )
    values (
      v_lycee,
      case when v_student.is_lucas then '10000000-0000-4000-a000-000000000005'::uuid else null end,
      v_student.first_name, v_student.last_name, v_student.birth_date::date, v_student.gender,
      'Antananarivo', '2025-09-01', 'enrolled'
    )
    returning id into v_student_id;

    if v_student.is_lucas then
      insert into public.student_guardians (school_id, student_id, guardian_id, relationship, is_primary)
      values (v_lycee, v_student_id, v_guardian, 'father', true);
    end if;

    -- 4 eleves en Seconde A, 4 en Premiere S
    insert into public.enrollments (school_id, student_id, class_id, academic_year_id)
    values (v_lycee, v_student_id,
            case when v_student.n <= 4 then v_classe_2a else v_classe_1s end,
            v_year);
  end loop;

  select count(*) into v_i from public.students where school_id = v_lycee;
  raise notice 'Seed module 2 : % eleves, 2 classes, 7 matieres.', v_i;
end
$$;
