# Architecture — SaaS de gestion scolaire multi-établissement

> Document de conception. À valider avant écriture du moindre code.

---

## 1. Principes directeurs

| Principe | Traduction concrète |
|---|---|
| **Multi-tenant strict** | `school_id` dénormalisé sur **toutes** les tables métier (même les tables filles comme `grades`). Permet des policies RLS simples, non récursives, et un index composite `(school_id, …)` partout. |
| **Sécurité côté base** | Aucune règle d'accès dans le frontend. RLS activé sur 100 % des tables. Le client React n'est qu'une vue ; un token volé ne donne accès qu'à son périmètre. |
| **Polyvalence primaire → université** | Le vocabulaire est paramétrable par établissement (`schools.settings`). Une « classe » est un groupe d'élèves rattaché à un niveau + une filière optionnelle : ça couvre `CP-A`, `6ème B`, `Terminale S`, `L3 Informatique groupe 2`. |
| **Historisation** | Rien n'est écrasé : `academic_years` + `enrollments` donnent l'historique scolaire, `term_results` fige les bulletins publiés, `audit_logs` trace les actions sensibles. |
| **Calculs déterministes en SQL** | Moyennes, rangs, soldes financiers = vues SQL + fonctions Postgres. Le frontend n'implémente jamais une règle de calcul. |
| **Code EN / UI FR** | Tables, colonnes, types, variables en anglais ; libellés utilisateur en français via `i18n`. Évite les `note`/`moyenne` mélangés à `SELECT`. ✅ *validé* |
| **Notation à double mode** | `schools.settings.grading.mode` = `weighted_average` (/20 pondéré, primaire→lycée) ou `ects` (UE, crédits, compensation). Même chaîne de saisie, agrégation et PDF différents. ✅ *validé* |

---

## 2. Stack

**Frontend**
- React 18 + Vite 5 + TypeScript (strict)
- React Router v6 (routes protégées par rôle)
- TanStack Query v5 (cache serveur, invalidations, optimistic updates)
- React Hook Form + Zod (`zodResolver`) — un schéma Zod par formulaire, réutilisé côté Edge Function
- Tailwind CSS + shadcn/ui
- Recharts (dashboards)
- `date-fns` (locale fr), `dnd-kit` (drag & drop emploi du temps), `papaparse` + `xlsx` (imports)

**Backend — Supabase**
- Postgres 15 + RLS + extensions `pgcrypto`, `btree_gist` (détection de conflits d'horaires), `pg_cron` + `pg_net` (relances automatiques)
- Auth : email/mot de passe + magic link, **custom access token hook** pour injecter `school_ids` et `roles` dans le JWT
- Storage : buckets privés, chemins préfixés par `school_id`
- Realtime : notifications, saisie de notes collaborative, présences
- Edge Functions (Deno) : génération PDF, emails, imports lourds

---

## 3. Arborescence

```
ecole/
├── docs/
│   ├── 01-architecture.md
│   └── 02-database-schema.md
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_extensions_and_enums.sql
│   │   ├── 0002_core_tenancy.sql            # schools, academic_years, terms
│   │   ├── 0003_identity_and_roles.sql      # profiles, memberships, helpers RLS
│   │   ├── 0004_rls_helpers.sql             # fonctions SECURITY DEFINER
│   │   ├── 0005_students_guardians.sql
│   │   ├── 0006_academic_structure.sql      # levels, programs, subjects, classes, rooms
│   │   ├── 0007_enrollments.sql
│   │   ├── 0008_timetable.sql               # slots + contraintes EXCLUDE, lessons
│   │   ├── 0009_grading.sql                 # assessments, grades, vues moyennes
│   │   ├── 0010_exams.sql
│   │   ├── 0011_finance.sql
│   │   ├── 0012_attendance.sql
│   │   ├── 0013_communication.sql
│   │   ├── 0014_numbering_and_audit.sql     # matricules, n° factures, audit
│   │   └── 0015_storage_policies.sql
│   ├── functions/
│   │   ├── _shared/                         # cors, supabase admin client, pdf renderer, mailer
│   │   ├── custom-access-token/             # hook JWT (roles + school_ids)
│   │   ├── generate-report-card/            # bulletin PDF
│   │   ├── generate-transcript/             # relevé de notes officiel
│   │   ├── generate-invoice/                # facture + reçu PDF
│   │   ├── send-payment-reminders/          # cron impayés
│   │   ├── send-notification/               # email + notification interne
│   │   └── import-students/                 # import CSV/Excel en masse
│   └── seed.sql                             # jeu de démo (1 lycée + 1 université)
└── web/
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── components.json                      # shadcn/ui
    └── src/
        ├── main.tsx
        ├── app/
        │   ├── App.tsx
        │   ├── router.tsx                   # arbre de routes + guards
        │   ├── providers.tsx                # QueryClient, Auth, School, Theme, Toaster
        │   └── layouts/                     # AppShell, AuthLayout, PrintLayout
        ├── components/
        │   ├── ui/                          # shadcn (généré)
        │   └── shared/
        │       ├── DataTable/               # tri, pagination serveur, filtres, export
        │       ├── FormDialog.tsx           # modale + RHF + Zod générique
        │       ├── ConfirmDialog.tsx
        │       ├── PageHeader.tsx
        │       ├── StatCard.tsx
        │       ├── EmptyState.tsx
        │       ├── FileUpload.tsx           # -> Supabase Storage
        │       ├── SchoolSwitcher.tsx
        │       ├── RoleGate.tsx             # rendu conditionnel par permission
        │       └── fields/                  # TextField, SelectField, DateField, StudentPicker…
        ├── features/
        │   ├── auth/                        # login, magic-link, reset, onboarding
        │   ├── schools/                     # paramètres établissement, années, périodes
        │   ├── students/
        │   ├── guardians/
        │   ├── staff/                       # enseignants & personnel
        │   ├── academics/                   # niveaux, filières, matières, classes, salles
        │   ├── timetable/
        │   ├── grading/
        │   ├── exams/
        │   ├── finance/
        │   ├── attendance/
        │   ├── communication/
        │   └── dashboard/                   # un sous-dossier par rôle
        ├── lib/
        │   ├── supabase.ts
        │   ├── queryClient.ts
        │   ├── permissions.ts               # matrice rôle -> action (miroir des RLS)
        │   ├── formatters.ts                # dates, montants, notes
        │   ├── csv.ts
        │   └── utils.ts                     # cn()
        ├── hooks/                           # useAuth, useSchool, useDebounce, usePagination
        ├── types/
        │   ├── database.types.ts            # généré: supabase gen types typescript
        │   └── domain.ts                    # types métier dérivés
        └── i18n/  fr.ts (+ en.ts)
```

**Convention par feature** — chaque dossier de `features/` suit le même moule :

```
features/students/
├── api/students.api.ts        # requêtes supabase brutes, typées
├── hooks/useStudents.ts       # useQuery / useMutation + clés de cache
├── schemas/student.schema.ts  # Zod (partagé création/édition)
├── components/                # StudentForm, StudentCard, StudentFilters…
├── pages/                     # StudentsListPage, StudentDetailPage…
└── index.ts
```

Clés de cache normalisées : `['students', schoolId, { filters }]` → l'invalidation par établissement est triviale.

---

## 4. Modèle de tenancy et RLS

### 4.1 Résolution de l'établissement courant

Un utilisateur peut appartenir à **plusieurs** établissements (un super admin gère un réseau ; un enseignant vacataire peut intervenir dans deux écoles). D'où :

```
auth.users ──1:1── profiles ──1:N── memberships ──N:1── schools
                                     (role)
```

`SchoolProvider` expose `{ activeSchool, role, permissions, switchSchool }`. L'établissement actif est persisté en `localStorage` et vérifié à chaque chargement contre les `memberships` réels.

### 4.2 Fonctions d'aide (clé de voûte)

Écrites en `SECURITY DEFINER STABLE` dans un schéma `private` non exposé, pour **éviter la récursion RLS** et permettre à Postgres de mettre le résultat en cache par requête :

| Fonction | Rôle |
|---|---|
| `private.user_school_ids()` → `uuid[]` | établissements de l'utilisateur (lu depuis le JWT, fallback table) |
| `private.has_role(school uuid, roles text[])` → `bool` | test de rôle |
| `private.is_school_admin(school uuid)` | raccourci `super_admin` + `school_admin` |
| `private.my_student_ids()` → `uuid[]` | élèves « visibles » : soi-même **ou** ses enfants (via `student_guardians`) |
| `private.my_taught_class_ids()` → `uuid[]` | classes de l'enseignant (prof principal + `class_subjects`) |

### 4.3 Forme canonique d'une policy

```sql
-- lecture: tout membre de l'école voit les élèves de son école,
-- sauf élève/parent qui ne voient qu'eux-mêmes
create policy students_select on public.students for select
using (
  school_id = any (private.user_school_ids())
  and (
    private.has_role(school_id, array['super_admin','school_admin','accountant','teacher'])
    or id = any (private.my_student_ids())
  )
);

-- écriture: administration uniquement
create policy students_write on public.students for all
using (private.is_school_admin(school_id))
with check (private.is_school_admin(school_id));
```

Toute table porte en plus : `create policy … for insert with check (school_id = any(private.user_school_ids()))` — impossible d'écrire dans une école tierce.

### 4.4 Matrice des permissions (résumé)

| Module | Super Admin | Admin étab. | Enseignant | Élève | Parent | Comptable |
|---|---|---|---|---|---|---|
| Établissements / années | CRUD (ses écoles) | R + paramètres | – | – | – | – |
| Élèves / inscriptions | CRUD | CRUD | R (ses classes) | R (soi) | R (enfants) | R |
| Classes / matières | CRUD | CRUD | R | R | R | – |
| Emploi du temps | CRUD | CRUD | R (+ propose) | R | R | – |
| Notes | R | CRUD | CRUD (ses matières, avant publication) | R (publiées) | R (publiées) | – |
| Bulletins | R | Générer/Publier | R | R (publiés) | R (publiés) | – |
| Examens / délibérations | R | CRUD | R + saisie | R (convocation, résultats) | R | – |
| Frais / paiements | R | R | – | R (soi) | R (enfants) | **CRUD** |
| Présences | R | CRUD | CRUD (ses cours) | R | R | – |
| Communication | CRUD | CRUD | Envoi ciblé (ses classes) | R | R | Relances |

`lib/permissions.ts` reproduit cette matrice **uniquement pour l'affichage** (masquer un bouton). L'autorité reste la RLS.

---

## 5. Authentification

1. **Inscription** — pas d'auto-inscription publique. Un admin crée le membre (`memberships`) et déclenche une invitation (`inviteUserByEmail`) ; l'utilisateur définit son mot de passe à la première connexion.
2. **Connexion** — email/mot de passe, ou magic link (utile pour les parents peu technophiles).
3. **Hook JWT** (`custom-access-token`) — injecte dans le token :
   ```json
   { "school_ids": ["…"], "roles": { "<school_id>": "school_admin" }, "is_platform_admin": false }
   ```
   → zéro requête supplémentaire dans les policies. À la modification d'un rôle, on force un `refreshSession()`.
4. **Garde de route** — `<RequireAuth>` puis `<RequireRole roles={[…]}>`, redirection vers le dashboard du rôle après login.

---

## 6. Edge Functions & jobs

| Function | Déclencheur | Sortie |
|---|---|---|
| `generate-report-card` | bouton admin / lot par classe | PDF bulletin → bucket `report-cards`, `term_results.pdf_path` |
| `generate-transcript` | demande élève / admin | relevé officiel numéroté |
| `generate-invoice` | création facture, enregistrement paiement | facture + reçu PDF |
| `send-payment-reminders` | `pg_cron` quotidien | emails de relance + `payment_reminders` |
| `import-students` | upload CSV/XLSX | validation ligne à ligne, rapport d'erreurs dans `import_jobs` |
| `send-notification` | trigger DB (annonce, note publiée, absence) | `notifications` + email |

Génération PDF : rendu HTML/CSS → PDF. **À valider** — Deno n'embarque pas Chromium ; options : `@react-pdf/renderer` (pur JS, fiable en Deno) ou un service headless externe. Ma recommandation : `@react-pdf/renderer`, sans dépendance externe.

## 7. Storage

| Bucket | Public | Chemin | Contenu |
|---|---|---|---|
| `avatars` | non | `{school_id}/{user_id}.jpg` | photos de profil |
| `student-photos` | non | `{school_id}/{student_id}.jpg` | photos élèves |
| `documents` | non | `{school_id}/students/{student_id}/…` | actes de naissance, justificatifs |
| `report-cards` | non | `{school_id}/{year}/{term}/{student_id}.pdf` | bulletins |
| `finance` | non | `{school_id}/invoices/…`, `/receipts/…` | factures, reçus |
| `imports` | non | `{school_id}/{job_id}.csv` | fichiers d'import |

Policies `storage.objects` basées sur `(storage.foldername(name))[1]::uuid = any(private.user_school_ids())` + contrôle de rôle.

---

## 8. Ordre de livraison

| # | Module | Contenu | Statut |
|---|---|---|---|
| 0 | **Fondations** | projet Vite, Supabase local, migrations socle, shadcn, DataTable/FormDialog | à faire |
| 1 | **Auth & rôles** | login, magic link, invitations, RLS helpers, guards, AppShell, school switcher | à faire |
| 2 | **Élèves & classes** | fiches, matricules, inscriptions, parents, import CSV, niveaux/filières/matières/salles | à faire |
| 3 | **Emplois du temps** | slots, contraintes anti-conflit, calendrier drag & drop, vues classe/prof/élève | à faire |
| 4 | **Notes** | évaluations, saisie rapide, coefficients **et UE/crédits**, moyennes, rangs, compensation, bulletins + relevés semestriels PDF | à faire |
| 5 | **Examens** | sessions, convocations, surveillance, résultats, délibérations, relevés | à faire |
| 6 | **Frais de scolarité** | grilles, échéanciers, factures, paiements partiels, reçus, relances | à faire |
| 7 | **Présences** | feuilles d'appel, justificatifs, statistiques, alertes | à faire |
| 8 | **Dashboards & communication** | 4 dashboards Recharts, annonces, notifications realtime | à faire |

Un résumé « fait / reste à faire » sera produit à la fin de chaque module.
