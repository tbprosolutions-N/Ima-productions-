import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/utils';

type Status = 'pending' | 'running' | 'pass' | 'fail' | 'skipped';

type CheckResult = {
  id: string;
  name: string;
  status: Status;
  details?: string;
};

function nowId(prefix: string) {
  return `${prefix}-${new Date().toISOString()}-${Math.random().toString(16).slice(2)}`;
}

export default function SystemHealthPage() {
  const storageDiag = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    let localStorageOk = false;
    let authKeyPresent = false;
    try {
      const k = '__ima_ls_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      localStorageOk = true;
    } catch {
      localStorageOk = false;
    }
    try {
      authKeyPresent = !!window.localStorage.getItem('ima_os_auth');
    } catch {
      authKeyPresent = false;
    }
    return { origin, localStorageOk, authKeyPresent };
  }, []);

  const initialChecks: CheckResult[] = useMemo(
    () => [
      { id: 'env', name: 'Env: Supabase variables present', status: 'pending' },
      { id: 'session', name: 'Auth: session readable', status: 'pending' },
      { id: 'profile', name: 'DB: user profile row exists (or auto-provision)', status: 'pending' },
      { id: 'agencies', name: 'DB: agencies readable under RLS', status: 'pending' },
      { id: 'crud', name: 'E2E: CRUD smoke (client/artist/event/document/audit)', status: 'pending' },
      { id: 'finance', name: 'E2E: finance_expenses insert/delete (finance roles)', status: 'pending' },
      { id: 'storage', name: 'Storage: expenses bucket list (RLS)', status: 'pending' },
    ],
    []
  );

  const fixHints: Record<string, string[]> = useMemo(
    () => ({
      env: [
        'Create `.env` in project root.',
        'Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.',
        'Restart the dev server after editing `.env`.',
      ],
      session: [
        'If “No active session”: go to `/login` and sign in.',
        'If you can’t sign in: confirm the Supabase Auth user exists and email is confirmed.',
        'If you use SSO/magic link: check redirect URLs in Supabase Auth settings.',
      ],
      profile: [
        'Run the updated `supabase/schema-clean.sql` so `public.users` + triggers exist.',
        'Make sure RPC `ensure_user_profile(company_code)` exists and is granted to `authenticated`.',
        'If the user existed before the trigger: login once then re-run `/health` (it should auto-provision).',
      ],
      agencies: [
        'Verify RLS policy “Users can read own agency” exists on `agencies`.',
        'Verify `public.users.agency_id` is populated for your user.',
        'If `users` row is missing, fix `profile` first (above).',
      ],
      crud: [
        'If inserts fail with RLS: check policies on `clients`, `artists`, `events`, `documents` for agency members.',
        'If events insert fails with missing fields: ensure schema matches `schema-clean.sql` and required columns exist.',
      ],
      finance: [
        'If role is not `owner/manager/finance`, this check is expected to be skipped.',
        'If insert is blocked: verify `finance_expenses` RLS policies allow INSERT for those roles.',
        'Confirm your `public.users.role` is set correctly.',
      ],
      storage: [
        'Create Supabase Storage bucket `expenses` (private).',
        'Apply storage RLS policies in `schema-clean.sql` for `storage.objects` on bucket `expenses`.',
        'Ensure you have at least read access: “Agency members can read expenses files”.',
      ],
    }),
    []
  );

  const [checks, setChecks] = useState<CheckResult[]>(initialChecks);
  const [busy, setBusy] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string>('');
  const [autoRan, setAutoRan] = useState(false);

  const setCheck = (id: string, patch: Partial<CheckResult>) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const runAll = useCallback(async () => {
    setBusy(true);
    setChecks(initialChecks);
    setLastRunAt(new Date().toISOString());

    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      // Hard safety net: never let health checks hang forever
      watchdog = setTimeout(() => {
        // If something *still* hangs, end the run and mark session as failed.
        setCheck('session', { status: 'fail', details: 'Timed out (health watchdog). Refresh and try again.' });
        setCheck('profile', { status: 'fail', details: 'Timed out (health watchdog).' });
        setCheck('agencies', { status: 'fail', details: 'Timed out (health watchdog).' });
        setCheck('crud', { status: 'fail', details: 'Timed out (health watchdog).' });
        setCheck('finance', { status: 'fail', details: 'Timed out (health watchdog).' });
        setCheck('storage', { status: 'fail', details: 'Timed out (health watchdog).' });
        setBusy(false);
      }, 20000);

      // 1) env
      setCheck('env', { status: 'running' });
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        setCheck('env', { status: 'fail', details: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY' });
        clearTimeout(watchdog);
        return;
      }
      setCheck('env', { status: 'pass', details: 'OK' });

      // 2) session
      setCheck('session', { status: 'running' });
      const { data: sessionData, error: sessionErr } = await withTimeout(
        supabase.auth.getSession(),
        10000,
        'Auth session'
      );
      if (sessionErr) {
        setCheck('session', { status: 'fail', details: sessionErr.message });
        clearTimeout(watchdog);
        return;
      }
      const sessionUserId = sessionData.session?.user?.id || '';
      setCheck('session', sessionUserId
        ? { status: 'pass', details: `Logged in as ${sessionData.session?.user?.email || sessionUserId}` }
        : { status: 'fail', details: 'No active session (log in first)' }
      );

      if (!sessionData.session?.user) {
        // remaining checks require auth
        setCheck('profile', { status: 'skipped', details: 'Requires login.' });
        setCheck('agencies', { status: 'skipped', details: 'Requires login.' });
        setCheck('crud', { status: 'skipped', details: 'Requires login.' });
        setCheck('finance', { status: 'skipped', details: 'Requires login.' });
        setCheck('storage', { status: 'skipped', details: 'Requires login.' });
        clearTimeout(watchdog);
        return;
      }

      const uid = sessionData.session.user.id;

      // 3) profile
      setCheck('profile', { status: 'running' });
      const { data: profile, error: profileErr } = await withTimeout(
        supabase.from('users').select('*').eq('id', uid).single(),
        6000,
        'Fetch profile'
      );
      if (profileErr) {
        // Try self-heal (requires ensure_user_profile in DB)
        const company_code = (localStorage.getItem('ima:last_company_id') || '').trim() || null;
        const { error: rpcErr } = await withTimeout(
          supabase.rpc('ensure_user_profile', { company_code }),
          6000,
          'Provision profile'
        );
        if (rpcErr) {
          setCheck('profile', { status: 'fail', details: `Missing profile and provisioning failed: ${rpcErr.message}` });
          clearTimeout(watchdog);
          return;
        }
        const { data: profile2, error: profile2Err } = await withTimeout(
          supabase.from('users').select('*').eq('id', uid).single(),
          6000,
          'Re-fetch profile'
        );
        if (profile2Err || !profile2) {
          setCheck('profile', { status: 'fail', details: profile2Err?.message || 'Profile still missing after provisioning' });
          clearTimeout(watchdog);
          return;
        }
        setCheck('profile', { status: 'pass', details: `Provisioned: ${profile2.role} / agency ${profile2.agency_id}` });
      } else {
        setCheck('profile', { status: 'pass', details: `${profile.role} / agency ${profile.agency_id}` });
      }

      const { data: me } = await withTimeout(
        supabase.from('users').select('*').eq('id', uid).single(),
        6000,
        'Fetch profile (me)'
      );
      const agencyId = me?.agency_id as string | undefined;
      const role = String(me?.role || '');

      // 4) agencies readable
      setCheck('agencies', { status: 'running' });
      const { data: agencies, error: agenciesErr } = await withTimeout(
        agencyId
          ? supabase.from('agencies').select('*').eq('id', agencyId).maybeSingle()
          : supabase.from('agencies').select('*').order('created_at', { ascending: true }),
        6000,
        'Fetch agencies'
      );
      if (agenciesErr) {
        setCheck('agencies', { status: 'fail', details: agenciesErr.message });
        clearTimeout(watchdog);
        return;
      }
      const mine = Array.isArray(agencies) ? agencies?.find((a: any) => a.id === agencyId) : (agencies as any);
      setCheck('agencies', { status: 'pass', details: mine ? `OK: ${mine.name}` : 'OK' });

      if (!agencyId) {
        setCheck('crud', { status: 'fail', details: 'Missing agency_id on profile' });
        clearTimeout(watchdog);
        return;
      }

      // 5) CRUD smoke
      setCheck('crud', { status: 'running' });
      const createdIds: { table: string; id: string }[] = [];
      try {
        const clientName = `QA Client ${new Date().toISOString()}`;
        const { data: c, error: cErr } = await withTimeout(
          supabase.from('clients').insert([{ agency_id: agencyId, name: clientName }]).select('*').single(),
          6000,
          'Insert client'
        );
        if (cErr || !c) throw new Error(`clients insert: ${cErr?.message || 'no row'}`);
        createdIds.push({ table: 'clients', id: c.id });

        const artistName = `QA Artist ${new Date().toISOString()}`;
        const { data: a, error: aErr } = await withTimeout(
          supabase.from('artists').insert([{ agency_id: agencyId, name: artistName }]).select('*').single(),
          6000,
          'Insert artist'
        );
        if (aErr || !a) throw new Error(`artists insert: ${aErr?.message || 'no row'}`);
        createdIds.push({ table: 'artists', id: a.id });

        const today = new Date().toISOString().slice(0, 10);
        const { data: ev, error: evErr } = await withTimeout(
          supabase
            .from('events')
            .insert([
              {
                agency_id: agencyId,
                producer_id: uid,
                client_id: c.id,
                artist_id: a.id,
                event_date: today,
                business_name: 'QA Event',
                invoice_name: 'QA Invoice',
                amount: 1,
              },
            ])
            .select('*')
            .single(),
          6000,
          'Insert event'
        );
        if (evErr || !ev) throw new Error(`events insert: ${evErr?.message || 'no row'}`);
        createdIds.push({ table: 'events', id: ev.id });

        const { data: doc, error: docErr } = await withTimeout(
          supabase
            .from('documents')
            .insert([
              {
                agency_id: agencyId,
                name: 'QA Document',
                type: 'agreement',
                template: 'QA template {{date}}',
                variables: { date: '' },
              },
            ])
            .select('*')
            .single(),
          6000,
          'Insert document'
        );
        if (docErr || !doc) throw new Error(`documents insert: ${docErr?.message || 'no row'}`);
        createdIds.push({ table: 'documents', id: doc.id });

        const { error: logErr } = await withTimeout(
          supabase.from('audit_logs').insert([
            {
              agency_id: agencyId,
              actor_id: uid,
              actor_name: me?.full_name || 'QA',
              actor_email: me?.email || null,
              action: 'event_updated',
              message: 'QA smoke test',
              meta: { source: 'SystemHealthPage' },
            },
          ]),
          6000,
          'Insert audit log'
        );
        if (logErr) throw new Error(`audit_logs insert: ${logErr.message}`);

        setCheck('crud', { status: 'pass', details: 'OK (created + cleaned)' });
      } catch (e: any) {
        setCheck('crud', { status: 'fail', details: e?.message || String(e) });
      } finally {
        // best-effort cleanup (reverse dependency order)
        const deletions = [...createdIds].reverse();
        for (const d of deletions) {
          try {
            await withTimeout(supabase.from(d.table).delete().eq('id', d.id), 6000, `Cleanup ${d.table}`);
          } catch {
            // ignore cleanup errors
          }
        }
      }

      // 6) finance_expenses insert/delete (role-based)
      setCheck('finance', { status: 'running' });
      if (!['owner', 'manager', 'finance'].includes(role)) {
        setCheck('finance', { status: 'pass', details: `Skipped (role=${role})` });
      } else {
        const storage_path = `${agencyId}/qa/${nowId('expense')}.txt`;
        const { data: fe, error: feErr } = await withTimeout(
          supabase
            .from('finance_expenses')
            .insert([
              {
                agency_id: agencyId,
                uploaded_by: uid,
                filename: 'qa-expense.txt',
                filetype: 'text/plain',
                size: 1,
                storage_path,
                vendor: 'QA Vendor',
                amount: 1,
                notes: 'QA insert/delete',
              },
            ])
            .select('*')
            .single(),
          6000,
          'Insert finance_expense'
        );
        if (feErr || !fe) {
          setCheck('finance', { status: 'fail', details: feErr?.message || 'Insert failed' });
        } else {
          const { error: delErr } = await withTimeout(
            supabase.from('finance_expenses').delete().eq('id', fe.id),
            6000,
            'Delete finance_expense'
          );
          if (delErr) setCheck('finance', { status: 'fail', details: `Inserted but delete failed: ${delErr.message}` });
          else setCheck('finance', { status: 'pass', details: 'OK' });
        }
      }

      // 7) storage list (read policy)
      setCheck('storage', { status: 'running' });
      const { data: list, error: listErr } = await withTimeout(
        supabase.storage.from('expenses').list(agencyId, { limit: 5 }),
        6000,
        'List storage'
      );
      if (listErr) setCheck('storage', { status: 'fail', details: listErr.message });
      else setCheck('storage', { status: 'pass', details: `OK (listed ${list?.length || 0})` });
      clearTimeout(watchdog);
    } catch (e: any) {
      // Surface the real error instead of leaving the watchdog to fire later.
      const msg = e?.message || String(e);
      setCheck('session', { status: 'fail', details: msg });
      setCheck('profile', { status: 'skipped', details: 'Aborted due to failure above.' });
      setCheck('agencies', { status: 'skipped', details: 'Aborted due to failure above.' });
      setCheck('crud', { status: 'skipped', details: 'Aborted due to failure above.' });
      setCheck('finance', { status: 'skipped', details: 'Aborted due to failure above.' });
      setCheck('storage', { status: 'skipped', details: 'Aborted due to failure above.' });
    } finally {
      if (watchdog) clearTimeout(watchdog);
      setBusy(false);
    }
  }, [initialChecks]);

  // Auto-run once on load (dev QA should never be "PENDING" forever)
  useEffect(() => {
    if (autoRan) return;
    setAutoRan(true);
    void runAll();
  }, [autoRan, runAll]);

  const copyReport = async () => {
    const text = [
      `NPC System Health Report (${new Date().toISOString()})`,
      ...checks.map((c) => `- [${c.status.toUpperCase()}] ${c.name}${c.details ? ` — ${c.details}` : ''}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied report to clipboard.');
    } catch {
      alert('Could not copy automatically. Select and copy manually.');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <Card className="glass border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>System Health (Dev) — E2E QA</CardTitle>
          <div className="flex gap-2">
            <Button onClick={runAll} disabled={busy}>
              {busy ? 'Running…' : 'Run all checks'}
            </Button>
            <Button variant="outline" onClick={copyReport} disabled={busy}>
              Copy report
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Auto-run: <span className="text-foreground/80">ON</span>
            {lastRunAt ? (
              <>
                {' '}
                · Last run: <span className="text-foreground/80">{lastRunAt}</span>
              </>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            Origin: <span className="text-foreground/80">{storageDiag.origin}</span>
            {' '}· localStorage: <span className="text-foreground/80">{storageDiag.localStorageOk ? 'OK' : 'BLOCKED'}</span>
            {' '}· authKey: <span className="text-foreground/80">{storageDiag.authKeyPresent ? 'present' : 'missing'}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            If you’re stuck on “טוען…”, run this page in another tab: <code>/health</code>. It will tell you exactly
            what’s failing (auth/profile/RLS/storage).
          </div>

          <div className="space-y-2">
            {checks.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-card/40 p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{c.name}</div>
                  {c.details ? <div className="text-xs text-muted-foreground break-words">{c.details}</div> : null}
                  {c.status === 'fail' && fixHints[c.id]?.length ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <div className="font-semibold text-foreground/90">How to fix</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {fixHints[c.id].map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-xs font-semibold">
                  {c.status === 'pending' && <span className="text-muted-foreground">PENDING</span>}
                  {c.status === 'running' && <span className="text-primary">RUNNING</span>}
                  {c.status === 'pass' && <span className="text-green-400">PASS</span>}
                  {c.status === 'fail' && <span className="text-red-400">FAIL</span>}
                  {c.status === 'skipped' && <span className="text-muted-foreground">SKIPPED</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

