import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Edit, Trash2, UserCircle, Phone, Mail, Building, MapPin, LayoutGrid, Table as TableIcon, Eye, FileDown, FolderOpen, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Label } from '@/components/ui/Label';
import { useAgency } from '@/contexts/AgencyContext';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Client, Event } from '@/types';
import { demoAddSentDoc } from '@/lib/sentDocs';
import { exportJsonToExcel } from '@/lib/exportUtils';
import { formatCurrency } from '@/lib/utils';
import { demoGetClients, demoGetEvents, demoSetClients, demoUpsertClient, isDemoMode } from '@/lib/demoStore';
import { useClientsQuery, useInvalidateClients } from '@/hooks/useSupabaseQuery';

const ClientsPage: React.FC = () => {
  const { currentAgency } = useAgency();
  const { success, error: showError } = useToast();
  const { user } = useAuth();
  const canSeeMoney = user?.role !== 'producer';
  const { data: clients = [], isLoading: loading } = useClientsQuery(currentAgency?.id);
  const invalidateClients = useInvalidateClients();
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [showExtra, setShowExtra] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderClient, setFolderClient] = useState<Client | null>(null);
  const [folderFrom, setFolderFrom] = useState(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [folderTo, setFolderTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [folderEvents, setFolderEvents] = useState<Event[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    vat_id: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (!currentAgency) throw new Error('אין סוכנות פעילה');

      if (isDemoMode()) {
        const existing = demoGetClients(currentAgency.id);
        const nextClient = demoUpsertClient(
          currentAgency.id,
          {
            name: formData.name,
            contact_person: formData.contact_person || undefined,
            email: formData.email || undefined,
            phone: formData.phone || undefined,
            address: formData.address || undefined,
            vat_id: formData.vat_id || undefined,
            notes: formData.notes || undefined,
          },
          editingClient?.id
        );

        const next = editingClient
          ? existing.map(c => (c.id === editingClient.id ? { ...nextClient, created_at: c.created_at } : c))
          : [nextClient, ...existing];

        demoSetClients(currentAgency.id, next);
        invalidateClients(currentAgency.id);
        success(editingClient ? 'לקוח עודכן בהצלחה! ✅' : 'לקוח נוסף בהצלחה! 🎉');
        closeDialog();
        return;
      }

      if (editingClient) {
        const payload = {
          name: formData.name,
          contact_person: formData.contact_person || null,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
          vat_id: formData.vat_id || null,
          notes: formData.notes || null,
        };
        const { error } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', editingClient.id);

        if (error) throw error;
        success('לקוח עודכן בהצלחה! ✅');
      } else {
        const payload = {
          agency_id: currentAgency?.id,
          name: formData.name,
          contact_person: formData.contact_person || null,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
          vat_id: formData.vat_id || null,
          notes: formData.notes || null,
        };
        const { error } = await supabase
          .from('clients')
          .insert([payload]);

        if (error) throw error;
        success('לקוח נוסף בהצלחה! 🎉');
      }

      invalidateClients(currentAgency.id);
      closeDialog();
    } catch (err: any) {
      showError(err.message || 'אירעה שגיאה בשמירה. אנא נסה שוב.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק לקוח זה?')) return;

    try {
      if (!currentAgency) throw new Error('אין סוכנות פעילה');

      if (isDemoMode()) {
        const next = demoGetClients(currentAgency.id).filter(c => c.id !== id);
        demoSetClients(currentAgency.id, next);
        invalidateClients(currentAgency.id);
        success('לקוח נמחק בהצלחה');
        return;
      }

      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      success('לקוח נמחק בהצלחה');
      invalidateClients(currentAgency.id);
    } catch (err: any) {
      showError(err.message || 'אירעה שגיאה במחיקה. אנא נסה שוב.');
    }
  };

  const openDialog = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name,
        contact_person: client.contact_person || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        vat_id: client.vat_id || '',
        notes: client.notes || '',
      });
    } else {
      setEditingClient(null);
      setFormData({
        name: '',
        contact_person: '',
        email: '',
        phone: '',
        address: '',
        vat_id: '',
        notes: '',
      });
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingClient(null);
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openPeriodSummary = (_clientId: string) => {
    if (!canSeeMoney) {
      showError('אין הרשאה להציג/לייצא סכומים עבור תפקיד Producer.');
      return;
    }
    // No navigation: open report generator via Dashboard
    window.location.assign(`/dashboard?report=1&preset=collection_status`);
  };

  const openClientFolder = (client: Client) => {
    setFolderClient(client);
    setFolderOpen(true);
  };

  useEffect(() => {
    const run = async () => {
      if (!currentAgency) return;
      if (!folderOpen || !folderClient) return;
      try {
        setFolderLoading(true);
        if (isDemoMode()) {
          const all = demoGetEvents(currentAgency.id);
          setFolderEvents(all.filter((e) => e.client_id === folderClient.id));
          return;
        }
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('agency_id', currentAgency.id)
          .eq('client_id', folderClient.id)
          .order('event_date', { ascending: false })
          .limit(200);
        if (error) throw error;
        setFolderEvents((data as Event[]) || []);
      } catch (e) {
        console.error(e);
        setFolderEvents([]);
      } finally {
        setFolderLoading(false);
      }
    };
    run();
  }, [currentAgency?.id, folderOpen, folderClient?.id]);

  const folderSummary = useMemo(() => {
    const from = folderFrom || '';
    const to = folderTo || '';
    const inPeriod = folderEvents.filter((e) => {
      const d = String(e.event_date || '').slice(0, 10);
      return (!from || d >= from) && (!to || d <= to);
    });
    const collected = inPeriod.filter((e) => e.status === 'paid');
    const notCollected = inPeriod.filter((e) => e.status === 'pending' || e.status === 'approved');
    const declined = inPeriod.filter((e) => e.status === 'cancelled');
    const incomePaid = collected.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const incomeTotal = inPeriod.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return {
      total: inPeriod.length,
      collectedCount: collected.length,
      notCollectedCount: notCollected.length,
      declinedCount: declined.length,
      incomePaid,
      incomeTotal,
      inPeriod,
    };
  }, [folderEvents, folderFrom, folderTo]);

  const exportClientPeriodReport = () => {
    if (!folderClient) return;
    if (!canSeeMoney) {
      showError('אין הרשאה להציג/לייצא סכומים עבור תפקיד Producer.');
      return;
    }
    const rows = folderSummary.inPeriod.map((e) => ({
      'תאריך אירוע': String(e.event_date || '').slice(0, 10),
      'שם עסק': e.business_name,
      'שם בחשבונית': e.invoice_name || '',
      'סטטוס': e.status === 'cancelled' ? 'נדחה' : e.status,
      'סכום לחברה': Number(e.amount) || 0,
      'תאריך תשלום': String(e.payment_date || '').slice(0, 10),
      'הערות': e.notes || '',
    }));
    const filename = `client_period_${folderClient.id}_${folderFrom || 'from'}_${folderTo || 'to'}`;
    try {
      exportJsonToExcel({ data: rows, filename, sheetName: 'Client Period', colWidths: [14, 28, 28, 12, 14, 14, 40] });
      success('הדוח יוצא בהצלחה ✅');
    } catch (e: any) {
      console.error(e);
      showError(e?.message || 'ייצוא נכשל');
    }
  };

  const sendClientPeriodSummary = () => {
    if (!currentAgency || !folderClient) return;
    const title = `סיכום תקופה · ${folderClient.name} · ${folderFrom || '—'} → ${folderTo || '—'}`;
    const body = [
      title,
      '',
      `סה״כ אירועים בתקופה: ${folderSummary.total}`,
      `נגבו (שולם): ${folderSummary.collectedCount}`,
      `טרם נגבו: ${folderSummary.notCollectedCount}`,
      `נדחה: ${folderSummary.declinedCount}`,
      '',
      canSeeMoney ? `סה״כ הכנסות (שולם): ${formatCurrency(folderSummary.incomePaid)}` : 'סה״כ הכנסות (שולם): ***',
      canSeeMoney ? `סה״כ הכנסות (כל התקופה): ${formatCurrency(folderSummary.incomeTotal)}` : 'סה״כ הכנסות (כל התקופה): ***',
      '',
      'פירוט אירועים:',
      ...folderSummary.inPeriod.slice(0, 200).map((e) => {
        const d = String(e.event_date || '').slice(0, 10);
        const status = e.status === 'paid' ? 'שולם' : e.status === 'approved' ? 'מאושר' : e.status === 'pending' ? 'ממתין' : 'נדחה';
        const amt = canSeeMoney ? formatCurrency(Number(e.amount) || 0) : '***';
        return `- ${d} · ${e.business_name} · ${status} · ${amt}`;
      }),
    ].join('\n');

    if (isDemoMode()) {
      demoAddSentDoc(currentAgency.id, {
        kind: 'custom',
        to: 'client',
        to_id: folderClient.id,
        to_name: folderClient.name,
        to_email: folderClient.email,
        title,
        rendered: body,
      });
      success('נוצר דוח ונוסף למסמכים שנשלחו (דמו) ✅');
      return;
    }
    success('הדוח נוצר. שליחה באימייל תתווסף לאחר חיבור Gmail (פרודקשן).');
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <UserCircle className="w-8 h-8 text-primary animate-pulse" />
            לקוחות
          </h1>
          <p className="text-muted-foreground mt-1">
            ניהול לקוחות ומקומות
          </p>
        </div>
        <Button onClick={() => openDialog()} className="btn-magenta">
          <Plus className="w-4 h-4 mr-2" />
          הוסף לקוח
        </Button>
      </motion.div>

      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש לקוח..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={view === 'grid' ? 'default' : 'outline'}
                className={view === 'grid' ? 'btn-magenta' : 'border-primary/30'}
                onClick={() => setView('grid')}
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                כרטיסים
              </Button>
              <Button
                type="button"
                variant={view === 'table' ? 'default' : 'outline'}
                className={view === 'table' ? 'btn-magenta' : 'border-primary/30'}
                onClick={() => setView('table')}
              >
                <TableIcon className="w-4 h-4 mr-2" />
                טבלה
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-primary/30"
                onClick={() => setShowExtra(v => !v)}
                title="מציג/מסתיר פרטים מתקדמים בכרטיסים ובטבלה"
              >
                <Eye className="w-4 h-4 mr-2" />
                {showExtra ? 'הסתר פרטים' : 'הצג פרטים'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              <p className="mt-4 text-muted-foreground">טוען לקוחות...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center ring-4 ring-primary/20 animate-pulse mx-auto mb-4">
                <UserCircle className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                אין נתונים להצגה
              </h3>
              <p className="text-muted-foreground text-sm mb-6">
                לחץ על הוסף לקוח כדי להתחיל
              </p>
              <Button onClick={() => openDialog()} className="btn-magenta">
                <Plus className="w-4 h-4 mr-2" />
                הוסף לקוח ראשון
              </Button>
            </div>
          ) : view === 'table' ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 dark:bg-gray-800/80">
                  <tr>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">שם עסק</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">איש קשר</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">אימייל</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">טלפון</th>
                    {showExtra && (
                      <>
                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">ח.פ/ע.מ</th>
                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">בנק</th>
                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">חשבון</th>
                      </>
                    )}
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <tr key={client.id} className="border-b">
                      <td className="p-3 font-medium">{client.name}</td>
                      <td className="p-3 text-muted-foreground">{client.contact_person || '-'}</td>
                      <td className="p-3 text-muted-foreground">{client.email || '-'}</td>
                      <td className="p-3 text-muted-foreground">{client.phone || '-'}</td>
                      {showExtra && <td className="p-3 text-muted-foreground">{client.vat_id || '-'}</td>}
                      <td className="p-3 align-middle">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-primary/30 hover:bg-primary/10"
                            onClick={() => openClientFolder(client)}
                            title="תיק לקוח"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-primary/30 hover:bg-primary/10"
                            onClick={() => openPeriodSummary(client.id)}
                            title="סיכום תקופה / דוח לפי לקוח"
                          >
                            <FileDown className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="border-primary/30 hover:bg-primary/10" onClick={() => openDialog(client)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="border-red-500/30 hover:bg-red-500/10 text-red-500" onClick={() => handleDelete(client.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClients.map((client, index) => (
                <motion.div
                  key={client.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.02, y: -4 }}
                >
                  <Card className="hover:shadow-[0_0_15px_hsl(var(--primary)/0.3)] transition-all duration-300 border-primary/20 hover:border-primary/50">
                    <CardContent className="p-6 flex flex-col gap-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col items-end gap-1 min-w-0 flex-1">
                          <h3 className="text-lg font-bold text-foreground truncate w-full text-right">
                            {client.name}
                          </h3>
                          {client.email && (
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                              <Mail className="w-4 h-4 text-primary shrink-0" />
                              <span className="truncate">{client.email}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openClientFolder(client)}
                            className="border-primary/30 hover:bg-primary/10"
                            title="תיק לקוח"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPeriodSummary(client.id)}
                            className="border-primary/30 hover:bg-primary/10"
                            title="סיכום תקופה / דוח לפי לקוח"
                          >
                            <FileDown className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDialog(client)}
                            className="border-primary/30 hover:bg-primary/10"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(client.id)}
                            className="border-red-500/30 hover:bg-red-500/10 text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center ring-2 ring-primary/20 shrink-0">
                          <Building className="w-5 h-5 text-primary" />
                        </div>
                        {client.contact_person && (
                          <span>איש קשר: {client.contact_person}</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 text-sm">
                        {client.phone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="w-4 h-4 text-primary" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                        {client.address && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="w-4 h-4 text-primary" />
                            <span className="truncate">{client.address}</span>
                          </div>
                        )}
                        {showExtra && (
                          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                            <div className="text-xs font-semibold text-primary">פרטים מתקדמים</div>
                            <div className="text-xs text-muted-foreground">
                              <span className="text-primary font-semibold">ח.פ/ע.מ:</span>{' '}
                              {client.vat_id || '—'}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client folder / profile */}
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col glass border-primary/20">
          <DialogHeader>
            <DialogTitle className="text-2xl text-foreground">תיק לקוח</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {folderClient?.name || '—'} · סיכום תקופה + דוחות
            </DialogDescription>
          </DialogHeader>

          {!folderClient ? (
            <div className="text-sm text-muted-foreground">אין לקוח.</div>
          ) : (
            <div className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-1">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-foreground">מתאריך</Label>
                  <Input type="date" value={folderFrom} onChange={(e) => setFolderFrom(e.target.value)} className="border-primary/30" />
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground">עד תאריך</Label>
                  <Input type="date" value={folderTo} onChange={(e) => setFolderTo(e.target.value)} className="border-primary/30" />
                </div>
                <div className="rounded-lg border border-border bg-card p-3 min-h-[4.5rem] flex flex-col justify-center">
                  <div className="text-xs text-muted-foreground">אירועים בתקופה</div>
                  <div className="text-lg font-bold text-foreground">{folderSummary.total}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    נגבו: {folderSummary.collectedCount} · טרם נגבו: {folderSummary.notCollectedCount} · נדחה: {folderSummary.declinedCount}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 min-h-[4.5rem] flex flex-col justify-center">
                  <div className="text-xs text-muted-foreground">הכנסות בתקופה</div>
                  <div className="text-lg font-bold text-foreground">
                    {canSeeMoney ? formatCurrency(folderSummary.incomePaid) : '***'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">שולם בלבד</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {folderLoading ? 'טוען אירועים…' : `נטענו ${folderEvents.length} אירועים (סה״כ)`}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="border-primary/30" onClick={exportClientPeriodReport} disabled={!canSeeMoney}>
                    <FileDown className="w-4 h-4 mr-2" />
                    ייצא דוח
                  </Button>
                  <Button type="button" className="btn-magenta" onClick={sendClientPeriodSummary}>
                    <Send className="w-4 h-4 mr-2" />
                    שלח סיכום תקופה
                  </Button>
                  {/* No navigation to Finance */}
                </div>
              </div>

              <div className="overflow-auto max-h-[50vh] overflow-x-auto lg:overflow-x-visible rounded-md border table-scroll-wrap">
                <table className="w-full text-sm min-w-[400px] lg:min-w-0">
                  <thead className="border-b bg-muted/50 dark:bg-gray-800/80">
                    <tr>
                      <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">תאריך</th>
                      <th className="h-10 px-3 text-right font-medium text-muted-foreground">עסק</th>
                      <th className="h-10 px-3 text-right font-medium text-muted-foreground">סטטוס</th>
                      <th className="h-10 px-3 text-right font-medium text-muted-foreground">סכום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folderSummary.inPeriod.slice(0, 200).map((e) => (
                      <tr key={e.id} className="border-b">
                        <td className="p-3 text-muted-foreground">{String(e.event_date || '').slice(0, 10)}</td>
                        <td className="p-3">{e.business_name}</td>
                        <td className="p-3 text-muted-foreground">
                          {e.status === 'paid' ? 'שולם' : e.status === 'approved' ? 'מאושר' : e.status === 'pending' ? 'ממתין' : 'נדחה'}
                        </td>
                        <td className="p-3">{canSeeMoney ? formatCurrency(Number(e.amount) || 0) : '***'}</td>
                      </tr>
                    ))}
                    {folderSummary.inPeriod.length === 0 && (
                      <tr>
                        <td className="p-6 text-center text-muted-foreground" colSpan={4}>
                          אין אירועים בתקופה שנבחרה.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl glass border-primary/20">
          <DialogHeader>
            <DialogTitle className="text-2xl text-foreground">
              {editingClient ? 'עריכת לקוח' : 'הוספת לקוח חדש'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              מלא את פרטי הלקוח
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">שם העסק *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="border-primary/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_person" className="text-foreground">איש קשר</Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  className="border-primary/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">אימייל</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="border-primary/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-foreground">טלפון</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="border-primary/30"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="address" className="text-foreground">כתובת</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="border-primary/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vat_id" className="text-foreground">ח.פ / ע.מ</Label>
                <Input
                  id="vat_id"
                  value={formData.vat_id}
                  onChange={(e) => setFormData({ ...formData, vat_id: e.target.value })}
                  className="border-primary/30"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="notes" className="text-foreground">הערות</Label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-background border border-primary/30 rounded-md text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>
                ביטול
              </Button>
              <Button type="submit" className="btn-magenta">
                {editingClient ? 'עדכן' : 'הוסף'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientsPage;
