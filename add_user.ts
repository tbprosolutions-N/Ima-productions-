#!/usr/bin/env npx tsx
/**
 * Add a new admin user to the users table (production).
 * Requires: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage: npx tsx add_user.ts
 *
 * Creates auth.users entry via Supabase Admin API, then inserts public.users row.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const url = process.env.VITE_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

// Load .env if keys missing
if (!url || !serviceKey) {
  try {
    const root = join(process.cwd(), '.env');
    const env = readFileSync(root, 'utf8');
    for (const line of env.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          const k = trimmed.slice(0, eq).trim();
          const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[k]) process.env[k] = v;
        }
      }
    }
  } catch {}
}

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const EMAIL = 'modu.general@gmail.com';
const FULL_NAME = 'Noa MODU';
const ROLE = 'owner';
const PREFERRED_AGENCY_ID = '96c0994d-4bc5-48b4-9351-4048e426618d';

async function main() {
  // 0) Resolve valid agency_id (FK constraint)
  let agencyId = PREFERRED_AGENCY_ID;
  const { data: agencies } = await admin.from('agencies').select('id').limit(5);
  if (agencies && agencies.length > 0) {
    const found = agencies.find((a: any) => a.id === PREFERRED_AGENCY_ID);
    agencyId = found ? found.id : (agencies[0] as any).id;
    if (agencyId !== PREFERRED_AGENCY_ID) {
      console.log('Using existing agency:', agencyId, '(preferred id not found)');
    }
  } else {
    console.error('No agencies in DB. Run bootstrap.sql first.');
    process.exit(1);
  }

  // 1) Create auth user (or get existing)
  let userId: string;

  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    email_confirm: false,
    user_metadata: { full_name: FULL_NAME, role: ROLE, agency_id: agencyId },
  });

  if (createErr) {
    const msg = String(createErr.message || '');
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = (listData?.users || []).find(
        (u: any) => (u.email || '').toLowerCase() === EMAIL.toLowerCase()
      );
      if (existing) {
        userId = existing.id;
        console.log('Auth user already exists:', EMAIL, '→ id:', userId);
      } else {
        console.error('Create failed and no existing user found:', createErr.message);
        process.exit(1);
      }
    } else {
      console.error('Create auth user failed:', createErr.message);
      process.exit(1);
    }
  } else {
    userId = createData?.user?.id ?? '';
    if (!userId) {
      console.error('No user id returned from createUser');
      process.exit(1);
    }
    console.log('Auth user created:', EMAIL, '→ id:', userId);
  }

  // 2) Upsert public.users
  const { error: upsertErr } = await admin.from('users').upsert(
    {
      id: userId,
      email: EMAIL.toLowerCase(),
      full_name: FULL_NAME,
      role: ROLE,
      agency_id: agencyId,
      onboarded: true,
    },
    { onConflict: 'id' }
  );

  if (upsertErr) {
    console.error('Upsert users failed:', upsertErr.message);
    process.exit(1);
  }

  console.log('✓ User inserted into public.users:', EMAIL);
  console.log('  You can now log in at https://npc-am.com/login');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
