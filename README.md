# Scolaria — SaaS de gestion scolaire multi-établissement

Application web de gestion scolaire couvrant le primaire, le collège, le lycée et
l'université : élèves, classes, emplois du temps, notes, examens, frais de
scolarité, présences et communication — avec isolation stricte des données par
établissement.

**Stack** — React 19 + Vite + TypeScript · TanStack Query · React Hook Form + Zod ·
Tailwind CSS + shadcn/ui · Supabase (Postgres/RLS, Auth, Storage, Realtime, Edge Functions).

> Conception détaillée : [`docs/01-architecture.md`](docs/01-architecture.md) et
> [`docs/02-database-schema.md`](docs/02-database-schema.md).

---

## Démarrage

### 1. Base de données

**Option A — projet Supabase distant** (recommandée)

```bash
supabase login
supabase link --project-ref <votre-project-ref>
supabase db push
supabase functions deploy invite-member
```

**Option B — sans CLI** : exécuter [`supabase/dist/schema-complet.sql`](supabase/dist/schema-complet.sql)
dans *Supabase Studio → SQL Editor*, sur un projet vierge.

**Option C — développement local** (Docker requis)

```bash
supabase start      # ports décalés : API 54421, DB 54422
supabase db reset   # migrations + jeu de démonstration
```

### 2. Frontend

```bash
cd web
cp .env.example .env.local   # renseigner l'URL et la clé publishable
npm install
npm run dev
```

### 3. Premier compte

Aucune inscription publique : le premier utilisateur crée son établissement via
l'écran d'accueil (`/bienvenue`) et en devient *super administrateur*. Les autres
membres sont ensuite invités par e-mail depuis **Paramètres → Membres & rôles**.

En local, le seed fournit six comptes (mot de passe `Demo1234!`) :

| Compte | Rôle | Établissement |
|---|---|---|
| `admin@lycee.test` | Admin | Lycée + Université (test du sélecteur multi-tenant) |
| `prof@lycee.test` | Enseignant | Lycée Victor Hugo |
| `compta@lycee.test` | Comptable | Lycée Victor Hugo |
| `parent@lycee.test` | Parent | Lycée Victor Hugo |
| `eleve@lycee.test` | Élève | Lycée Victor Hugo |
| `doyen@universite.test` | Super admin | Université de Kasia (mode ECTS) |

---

## Organisation

```
docs/                      conception (architecture, schéma)
supabase/
  migrations/              schéma SQL versionné
  functions/               Edge Functions (Deno)
  seed.sql                 jeu de démonstration local
  dist/schema-complet.sql  concaténation des migrations
web/src/
  app/                     providers, routeur, gardes, layouts
  components/ui/           shadcn/ui
  components/shared/       DataTable, FormDialog, ConfirmDialog, StatCard…
  features/<module>/       api · hooks · schemas · components · pages
  lib/                     supabase, queryClient, permissions, formatters
  types/                   database.types.ts (généré) + domain.ts
```

Chaque module suit le même découpage vertical. Les clés de cache TanStack Query
portent l'identifiant d'établissement en second élément, ce qui rend
l'invalidation par tenant triviale (`invalidateSchool(schoolId)`).

---

## Sécurité

L'autorisation vit **dans la base**, pas dans le frontend.

- RLS activée sur toutes les tables ; `school_id` dénormalisé partout pour des
  policies sans jointure ni récursion.
- Fonctions d'aide en `SECURITY DEFINER` dans un schéma `private` non exposé
  (`user_school_ids`, `has_role`, `is_school_admin`…).
- `lib/permissions.ts` ne sert qu'à masquer des boutons : il reflète les policies,
  il ne les remplace pas.
- Numérotation (matricules, factures) via `next_number()`, atomique et sans trou.
- `audit_logs` journalise les opérations sensibles.

---

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement Vite |
| `npm run build` | typecheck + build de production |
| `npm run preview` | prévisualisation du build |
| `supabase db reset` | recrée la base locale (migrations + seed) |
| `supabase gen types typescript --local --schema public > web/src/types/database.types.ts` | régénère les types |

> Après toute migration, régénérer les types : le typecheck échoue sinon.

---

## État d'avancement

| Module | État |
|---|---|
| 0 · Fondations, socle SQL, composants partagés | ✅ |
| 1 · Auth, rôles, multi-tenant, années & périodes, membres | ✅ |
| 2 · Élèves, classes, référentiels, enseignants, import CSV | ✅ |
| 3 · Emplois du temps | à venir |
| 4 · Notes & bulletins | à venir |
| 5 · Examens | à venir |
| 6 · Frais de scolarité | à venir |
| 7 · Présences | à venir |
| 8 · Dashboards & communication | à venir |
