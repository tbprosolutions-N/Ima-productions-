import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useAuth } from '@/contexts/AuthContext';
import { useAgency } from '@/contexts/AgencyContext';
import {
  demoDefaultEvent,
  demoGetArtists,
  demoGetClients,
  demoGetDocuments,
  demoGetEvents,
  demoSetArtists,
  demoSetClients,
  demoSetDocuments,
  demoSetEvents,
  demoUpsertArtist,
  demoUpsertClient,
  demoUpsertDocument,
  isDemoMode,
} from '@/lib/demoStore';
import { demoAddSentDoc, demoGetSentDocs } from '@/lib/sentDocs';
import { getCompanyName, setCompanyName } from '@/lib/settingsStore';
import { addActivity } from '@/lib/activityLog';
import { getFinanceExpenses, setFinanceExpenses, type FinanceExpense } from '@/lib/financeStore';

type StepResult = { label: string; ok: boolean; details?: string };

const QATestPage: React.FC = () => {
  const { user } = useAuth();
  const { currentAgency } = useAgency();

  const [results, setResults] = useState<StepResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<'owner' | 'manager' | 'finance' | 'producer'>(
    (user?.role as any) || 'owner'
  );
  const [companyNameInput, setCompanyNameInput] = useState('');

  const agencyId = currentAgency?.id ?? 'ima-productions-id';
  const userId = user?.id ?? 'demo-user-id';

  const counts = useMemo(() => {
    const expensesCount = getFinanceExpenses(agencyId).length;

    return {
      events: demoGetEvents(agencyId).length,
      artists: demoGetArtists(agencyId).length,
      clients: demoGetClients(agencyId).length,
      documents: demoGetDocuments(agencyId).length,
      sentDocs: demoGetSentDocs(agencyId).length,
      expenses: expensesCount,
    };
  }, [agencyId, results]);

  const ensureDemoAuth = () => {
    localStorage.setItem('demo_authenticated', 'true');
    localStorage.setItem(
      'demo_user',
      JSON.stringify({
        id: 'demo-user-id',
        email: 'modu.general@gmail.com',
        full_name: 'Noa Tibi',
        role,
        agency_id: 'ima-productions-id',
        onboarded: true,
      })
    );
  };

  const clearAllDemoData = () => {
    demoSetEvents(agencyId, []);
    demoSetArtists(agencyId, []);
    demoSetClients(agencyId, []);
    demoSetDocuments(agencyId, []);
    localStorage.removeItem(`ima_demo_${agencyId}_sent_docs`);
    localStorage.removeItem(`ima_finance_${agencyId}_expenses`);
    localStorage.removeItem(`ima_finance_${agencyId}_checklist`);
    localStorage.removeItem(`ima_activity_${agencyId}`);
  };

  const prepareDemo = () => {
    // Clean reset (keeps branding settings like logo/company name)
    clearAllDemoData();

    // Ensure demo auth as owner and disable tutorial popups
    localStorage.setItem('demo_authenticated', 'true');
    localStorage.setItem(
      'demo_user',
      JSON.stringify({
        id: 'demo-user-id',
        email: 'modu.general@gmail.com',
        full_name: 'Noa Tibi',
        role: 'owner',
        permissions: { finance: true, users: true, integrations: true, events_create: true },
        agency_id: 'ima-productions-id',
        onboarded: true,
      })
    );
    localStorage.setItem('ima_tour_disabled_demo-user-id', 'true');
    localStorage.setItem('ima_tour_done_demo-user-id', 'true');

    // Seed a small, curated dataset for presentation
    if (!getCompanyName(agencyId)) setCompanyName(agencyId, 'NPC');

    const artist = demoUpsertArtist(agencyId, {
      name: 'DJ Noa',
      full_name: 'Noa DJ',
      company_name: 'NPC',
      email: 'artist.demo@example.com',
      phone: '050-1111111',
      vat_id: '123456789',
      bank_id: '12',
      bank_name: 'Hapoalim',
      bank_account: '123456',
      bank_branch: '123',
      notes: 'דמו',
    });
    demoSetArtists(agencyId, [artist]);

    const client = demoUpsertClient(agencyId, {
      name: 'The Venue TLV',
      contact_person: 'Dana',
      email: 'client.demo@example.com',
      phone: '052-2222222',
      address: 'Tel Aviv',
      vat_id: '987654321',
      notes: 'דמו',
    });
    demoSetClients(agencyId, [client]);

    const doc = demoUpsertDocument(agencyId, {
      title: 'הסכם אמן (דמו)',
      type: 'artist_agreement',
      content: 'הסכם זה נחתם ביום {{event_date}} בין {{business_name}} לבין {{artist_name}}. סכום: {{amount}}',
    });
    demoSetDocuments(agencyId, [doc]);

    const today = new Date().toISOString().slice(0, 10);
    const event1 = demoDefaultEvent(agencyId, userId, {
      business_name: 'אירוע דמו — חתונה',
      invoice_name: 'חשבונית דמו',
      amount: 12500,
      event_date: today,
    });
    demoSetEvents(agencyId, [{ ...event1, artist_id: artist.id, client_id: client.id }]);

    // Seed one expense with viewable file
    const sampleImg =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
    const expenses: FinanceExpense[] = [
      {
        id: globalThis.crypto?.randomUUID?.() ?? `exp-${Date.now()}`,
        created_at: new Date().toISOString(),
        filename: 'receipt-demo.png',
        filetype: 'image/png',
        size: 67,
        dataUrl: sampleImg,
        vendor: 'Coffee TLV',
        amount: 42,
        notes: 'דמו',
        morning_status: 'not_synced',
      },
    ];
    setFinanceExpenses(agencyId, expenses);

    // Minimal “last activity”
    addActivity(agencyId, {
      actor_name: 'Noa Tibi',
      actor_email: 'modu.general@gmail.com',
      action: 'event_created',
      message: 'נוצר אירוע דמו',
      meta: { id: event1.id },
    });
    addActivity(agencyId, {
      actor_name: 'Noa Tibi',
      actor_email: 'modu.general@gmail.com',
      action: 'expense_uploaded',
      message: 'הועלתה הוצאה לדמו',
      meta: { filename: 'receipt-demo.png' },
    });

    setResults([{ label: 'Demo prepared for presentation', ok: true }]);
    window.location.assign('/dashboard');
  };

  const seedDemoDataset = () => {
    const out: StepResult[] = [];
    ensureDemoAuth();
    out.push({ label: 'Demo auth present', ok: isDemoMode() });

    const currentName = getCompanyName(agencyId);
    if (!currentName) setCompanyName(agencyId, 'NPC');
    out.push({ label: 'Company name set', ok: true, details: getCompanyName(agencyId) || 'NPC' });

    const artist = demoUpsertArtist(agencyId, {
      name: 'DJ QA',
      full_name: 'QA Artist',
      company_name: 'QA Music Ltd',
      email: 'artist.qa@example.com',
      phone: '050-0000000',
      vat_id: '123456789',
      bank_id: '12',
      bank_name: 'Hapoalim',
      bank_account: '123456',
      bank_branch: '123',
      notes: 'נוצר בבדיקת QA',
    });
    demoSetArtists(agencyId, [artist, ...demoGetArtists(agencyId)]);
    out.push({ label: 'Seed Artist', ok: true });

    const client = demoUpsertClient(agencyId, {
      name: 'QA Venue',
      contact_person: 'Noa',
      email: 'client.qa@example.com',
      phone: '052-0000000',
      address: 'Tel Aviv',
      vat_id: '987654321',
      notes: 'נוצר בבדיקת QA',
    });
    demoSetClients(agencyId, [client, ...demoGetClients(agencyId)]);
    out.push({ label: 'Seed Client', ok: true });

    const doc = demoUpsertDocument(agencyId, {
      title: 'הסכם בסיסי (QA)',
      type: 'artist_agreement',
      content: 'הסכם זה נחתם ביום {{event_date}} בין {{business_name}} לבין {{artist_name}}.',
    });
    demoSetDocuments(agencyId, [doc, ...demoGetDocuments(agencyId)]);
    out.push({ label: 'Seed Document Template', ok: true });

    const event = demoDefaultEvent(agencyId, userId, {
      business_name: 'אירוע QA',
      invoice_name: 'חשבונית QA',
      amount: 5000,
      event_date: new Date().toISOString().slice(0, 10),
    });
    const eventLinked = { ...event, artist_id: artist.id, client_id: client.id };
    demoSetEvents(agencyId, [eventLinked, ...demoGetEvents(agencyId)]);
    out.push({ label: 'Seed Event (linked)', ok: true });

    const sampleImg =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
    const expenses: FinanceExpense[] = [
      {
        id: globalThis.crypto?.randomUUID?.() ?? `exp-${Date.now()}`,
        created_at: new Date().toISOString(),
        filename: 'receipt-qa.png',
        filetype: 'image/png',
        size: 67,
        dataUrl: sampleImg,
        vendor: 'QA Coffee',
        amount: 42,
        notes: 'נוצר בבדיקת QA',
        morning_status: 'not_synced',
      },
      {
        id: globalThis.crypto?.randomUUID?.() ?? `exp-${Date.now()}-2`,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        filename: 'invoice-qa.pdf',
        filetype: 'application/pdf',
        size: 1024,
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDw+PgplbmRvYmoK',
        vendor: 'QA Supplier',
        amount: 1800,
        notes: 'PDF דמו קצר',
        morning_status: 'not_synced',
      },
    ];
    setFinanceExpenses(agencyId, expenses);
    out.push({ label: 'Seed Finance expenses (with files)', ok: true });

    demoAddSentDoc(agencyId, {
      kind: 'agreement',
      to: 'artist',
      to_id: artist.id,
      to_name: artist.name,
      to_email: artist.email,
      event_id: eventLinked.id,
      title: 'הסכם QA (נשלח)',
      rendered: 'דמו: הסכם נשלח בהצלחה.',
    });
    out.push({ label: 'Seed Sent Document record', ok: true });

    setResults(out);
  };

  const validate = () => {
    const out: StepResult[] = [];

    out.push({
      label: 'Demo mode enabled',
      ok: isDemoMode(),
      details: 'requires demo_authenticated=true',
    });

    const events = demoGetEvents(agencyId);
    const artists = demoGetArtists(agencyId);
    const clients = demoGetClients(agencyId);
    const docs = demoGetDocuments(agencyId);
    const sentDocs = demoGetSentDocs(agencyId);

    out.push({
      label: 'Data exists across tabs',
      ok: events.length > 0 && artists.length > 0 && clients.length > 0 && docs.length > 0,
      details: `events=${events.length}, artists=${artists.length}, clients=${clients.length}, documents=${docs.length}`,
    });

    const linkedOk = events.every((e) => {
      const aOk = !e.artist_id || artists.some((a) => a.id === e.artist_id);
      const cOk = !e.client_id || clients.some((c) => c.id === e.client_id);
      return aOk && cOk;
    });
    out.push({
      label: 'Events links are consistent (artist_id/client_id exist)',
      ok: linkedOk,
      details: linkedOk ? 'All event links are valid.' : 'Some events reference missing artist/client.',
    });

    const expensesOk = (() => {
      const list = getFinanceExpenses(agencyId);
      return list.length > 0 && list.every((x) => !!x.filename && !!x.filetype);
    })();
    out.push({
      label: 'Finance expenses present (file metadata exists)',
      ok: expensesOk,
      details: `expenses=${counts.expenses}`,
    });

    out.push({
      label: 'Documents sent history present',
      ok: sentDocs.length > 0,
      details: `sentDocs=${sentDocs.length}`,
    });

    out.push({
      label: 'RBAC sanity: Finance access expectation',
      ok: role !== 'producer',
      details:
        role === 'producer'
          ? 'As producer you should NOT access /finance (should redirect).'
          : 'As finance/manager/owner you should access /finance.',
    });

    setResults(out);
  };

  const runAll = async () => {
    setBusy(true);
    try {
      seedDemoDataset();
      validate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 glass">
        <CardHeader>
          <CardTitle>QA Command Center (Demo-first)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            לפני הדמו: לחץ/י “Run Full QA” כדי לזרוע דאטה דמו מלא + להריץ בדיקות PASS/FAIL.
          </div>
          <div className="text-sm">
            <div>
              <strong>Agency</strong>: {agencyId}
            </div>
            <div>
              <strong>User</strong>: {user?.full_name ?? 'Demo User'}
            </div>
            <div>
              <strong>Mode</strong>: {isDemoMode() ? 'DEMO' : 'NON-DEMO'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">תפקיד לדמו (RBAC)</div>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">בעלים</SelectItem>
                  <SelectItem value="manager">מנהל</SelectItem>
                  <SelectItem value="finance">כספים</SelectItem>
                  <SelectItem value="producer">מפיק</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <div className="text-xs text-muted-foreground">שם חברה (דמו)</div>
              <div className="flex gap-2">
                <Input
                  value={companyNameInput}
                  onChange={(e) => setCompanyNameInput(e.target.value)}
                  placeholder="לדוגמה: NPC"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const name = companyNameInput.trim();
                    if (!name) return;
                    setCompanyName(agencyId, name);
                    setCompanyNameInput('');
                    setResults([{ label: 'Company name updated', ok: true }]);
                  }}
                >
                  עדכן
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button className="btn-magenta" type="button" disabled={busy} onClick={runAll}>
              Run Full QA (Seed + Validate)
            </Button>
            <Button
              type="button"
              className="btn-magenta"
              disabled={busy}
              onClick={prepareDemo}
            >
              Prepare Demo Presentation
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={seedDemoDataset}>
              Seed demo dataset
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={validate}>
              Validate only
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                clearAllDemoData();
                setResults([{ label: 'Cleared demo data', ok: true }]);
              }}
            >
              Clear demo data
            </Button>
            <Button
              type="button"
              className="btn-magenta"
              onClick={() => {
                ensureDemoAuth();
                window.location.assign('/dashboard');
              }}
            >
              Go to Dashboard (Demo)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Current demo counts</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          events: {counts.events} | artists: {counts.artists} | clients: {counts.clients} | documents: {counts.documents} | sent: {counts.sentDocs} | expenses: {counts.expenses}
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {results.length === 0 ? (
            <div className="text-muted-foreground">No tests run yet.</div>
          ) : (
            results.map((r, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{r.label}</div>
                  {r.details && <div className="text-muted-foreground">{r.details}</div>}
                </div>
                <div className={r.ok ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'}>
                  {r.ok ? 'PASS' : 'FAIL'}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default QATestPage;

