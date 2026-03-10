# Schema-to-Code Alignment

This doc records the **actual** database columns so the app and RPCs stay aligned. Source: Supabase migrations and CHECK constraints.

## public.users

| Column       | Type     | Notes |
|-------------|----------|--------|
| id          | uuid     | PK, references auth.users(id) |
| email       | varchar  | NOT NULL |
| full_name   | varchar  | NOT NULL |
| role        | text     | CHECK (role IN ('producer','finance','manager','owner')) |
| agency_id   | uuid     | NOT NULL, references agencies(id) |
| permissions | jsonb    | DEFAULT '{}' |
| avatar_url  | text     | |
| onboarded   | boolean  | DEFAULT false |
| created_at  | timestamptz | |
| updated_at  | timestamptz | |

**There is no `company_code` column on users.** `company_code` is only the **RPC parameter** name for `ensure_user_profile(company_code text)`; the function uses it to look up `agencies.company_id` in some deployments (e.g. ensure_user_profile.sql), or ignores it in the consolidated flow (bootstrap / invite-only).

## public.agencies

| Column     | Type     | Notes |
|------------|----------|--------|
| id         | uuid     | PK |
| name       | varchar  | NOT NULL |
| type       | varchar  | CHECK (type IN ('ima','bar','nightclub')) |
| company_id | varchar  | e.g. IMA001, NPC001 |
| settings   | jsonb    | DEFAULT '{}' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Column is `company_id`, not `company_code`.** The app passes `company_code` only as the argument to `ensure_user_profile(company_code)`; the DB matches it to `agencies.company_id` where applicable.

## ensure_user_profile(company_code text DEFAULT NULL)

- **Returns:** `public.users` row.
- **INSERT columns used:** Only columns that exist on `public.users`:  
  `id, email, full_name, role, agency_id, onboarded`.  
  No `company_code` or other assumed columns.
- **Parameter:** `company_code` is optional; in some DB versions it is used to resolve agency via `agencies.company_id = trim(company_code)`; in the consolidated migration it is unused (bootstrap or invite-only path).

## TypeScript

- **User** (`src/types/index.ts`): Matches `public.users` column names and `UserRole` = `'producer' | 'finance' | 'manager' | 'owner'`.
- **Agency** (`src/types/index.ts`): Matches `public.agencies`; `company_id` is optional on the type when not selected.

## public.pending_invites

| Column    | Type   | Notes |
|-----------|--------|--------|
| id        | uuid   | PK |
| email     | text   | NOT NULL |
| full_name | text   | NOT NULL DEFAULT '' |
| role      | text   | CHECK (role IN ('producer','finance','manager','owner')) |
| agency_id | uuid   | NOT NULL, references agencies(id) |
| invited_by| uuid   | NOT NULL, references auth.users(id) |
| permissions | jsonb | DEFAULT '{}' |
| created_at | timestamptz | |

## Cross-check

- All `supabase.from('users').select(...)` use only: id, email, full_name, role, agency_id, permissions, avatar_url, created_at, updated_at, onboarded.
- All `supabase.from('agencies').select(...)` use only columns from the agencies table above (e.g. id, name, type, company_id, settings, created_at, updated_at).
- All `supabase.from('pending_invites').select(...)` use only: id, email, full_name, role, agency_id, created_at (and invited_by, permissions when needed).
- Role checks in app use only: producer, finance, manager, owner.
