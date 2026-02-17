import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Label } from '@/components/ui/Label';
import { useAgency } from '@/contexts/AgencyContext';
import { useToast } from '@/contexts/ToastContext';
import { supabase } from '@/lib/supabase';
import { demoGetDocuments, demoSetDocuments, demoUpsertDocument, isDemoMode } from '@/lib/demoStore';
import type { Document, DocumentTemplateType, DocumentSendTo } from '@/types';

const DB_TYPE_MAP: Record<string, DocumentTemplateType> = {
  agreement: 'client_agreement',
  invoice: 'invoice_template',
  receipt: 'invoice_template',
  contract: 'other',
};
const TYPE_TO_DB: Record<DocumentTemplateType, string> = {
  client_agreement: 'agreement',
  artist_agreement: 'agreement',
  appearance_agreement: 'agreement',
  invoice_template: 'invoice',
  other: 'contract',
};

const DocumentsPage: React.FC = () => {
  const { currentAgency } = useAgency();
  const { success, error: showError } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [formData, setFormData] = useState({ title: '', type: 'other' as DocumentTemplateType, content: '', send_to: 'both' as DocumentSendTo });

  useEffect(() => {
    if (!currentAgency) return;
    const load = async () => {
      setLoading(true);
      if (isDemoMode()) {
        setDocuments(demoGetDocuments(currentAgency.id));
      } else {
        const { data, error } = await supabase
          .from('documents')
          .select('id,agency_id,name,type,template,send_to,created_at,updated_at')
          .eq('agency_id', currentAgency.id)
          .order('created_at', { ascending: false });
        if (error) {
          showError('שגיאה בטעינת תבניות');
          setDocuments([]);
        } else {
          setDocuments(
            ((data || []) as { id: string; agency_id: string; name: string; type: string; template: string; send_to?: string; created_at: string; updated_at: string }[]).map((r) => ({
              id: r.id,
              agency_id: r.agency_id,
              title: r.name,
              type: (DB_TYPE_MAP[r.type] || 'other') as DocumentTemplateType,
              content: r.template || '',
              send_to: (r.send_to === 'artist' || r.send_to === 'client' || r.send_to === 'both' ? r.send_to : 'both') as DocumentSendTo,
              created_at: r.created_at,
              updated_at: r.updated_at,
            }))
          );
        }
      }
      setLoading(false);
    };
    load();
  }, [currentAgency?.id]);

  const openDialog = (doc?: Document) => {
    if (doc) {
      setEditingDoc(doc);
      setFormData({ title: doc.title, type: doc.type, content: doc.content, send_to: doc.send_to || 'both' });
    } else {
      setEditingDoc(null);
      setFormData({ title: '', type: 'other', content: '', send_to: 'both' });
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingDoc(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency) return;
    try {
      if (isDemoMode()) {
        const updated = demoUpsertDocument(
          currentAgency.id,
          { title: formData.title, type: formData.type, content: formData.content, send_to: formData.send_to },
          editingDoc?.id
        );
        const list = editingDoc
          ? documents.map((d) => (d.id === editingDoc.id ? updated : d))
          : [updated, ...documents];
        demoSetDocuments(currentAgency.id, list);
        setDocuments(list);
        success(editingDoc ? 'תבנית עודכנה' : 'תבנית נוספה');
      } else {
        const dbType = TYPE_TO_DB[formData.type];
        if (editingDoc) {
          const { error } = await supabase
            .from('documents')
            .update({
              name: formData.title,
              type: dbType,
              template: formData.content,
              send_to: formData.send_to || 'both',
              updated_at: new Date().toISOString(),
            })
            .eq('id', editingDoc.id);
          if (error) throw error;
          success('תבנית עודכנה');
        } else {
          const { error } = await supabase.from('documents').insert({
            agency_id: currentAgency.id,
            name: formData.title,
            type: dbType,
            template: formData.content,
            send_to: formData.send_to || 'both',
          });
          if (error) throw error;
          success('תבנית נוספה');
        }
        const { data } = await supabase
          .from('documents')
          .select('*')
          .eq('agency_id', currentAgency.id)
          .order('created_at', { ascending: false });
        setDocuments(
          ((data || []) as { id: string; agency_id: string; name: string; type: string; template: string; send_to?: string; created_at: string; updated_at: string }[]).map((r) => ({
            id: r.id,
            agency_id: r.agency_id,
            title: r.name,
            type: (DB_TYPE_MAP[r.type] || 'other') as DocumentTemplateType,
            content: r.template || '',
            send_to: (r.send_to === 'artist' || r.send_to === 'client' || r.send_to === 'both' ? r.send_to : 'both') as DocumentSendTo,
            created_at: r.created_at,
            updated_at: r.updated_at,
          }))
        );
      }
      closeDialog();
    } catch (err: any) {
      showError(err?.message || 'שגיאה בשמירה');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק תבנית זו?')) return;
    if (!currentAgency) return;
    try {
      if (isDemoMode()) {
        const next = documents.filter((d) => d.id !== id);
        demoSetDocuments(currentAgency.id, next);
        setDocuments(next);
        success('תבנית נמחקה');
      } else {
        const { error } = await supabase.from('documents').delete().eq('id', id);
        if (error) throw error;
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        success('תבנית נמחקה');
      }
    } catch (err: any) {
      showError(err?.message || 'שגיאה במחיקה');
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-4"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-8 h-8 text-primary" />
            מסמכים
          </h1>
          <p className="text-muted-foreground">תבניות מסמכים ומסמכים שנשלחו</p>
        </div>
        <Button type="button" className="btn-magenta shrink-0" onClick={() => openDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          צור תבנית חדשה
        </Button>
      </motion.div>

      <Card className="border-primary/20">
        <CardHeader />
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-r-transparent" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">אין תבניות. תבניות נשמרות במערכת ולא נעלמות ברענון.</p>
              <Button type="button" className="btn-magenta" onClick={() => openDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                צור תבנית ראשונה
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{doc.title}</p>
                    <p className="text-sm text-muted-foreground">{doc.type}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button type="button" size="sm" variant="outline" className="border-primary/30" onClick={() => openDialog(doc)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="border-red-500/30 text-red-500 hover:bg-red-500/10" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg border-primary/20">
          <DialogHeader>
            <DialogTitle>{editingDoc ? 'עריכת תבנית' : 'תבנית חדשה'}</DialogTitle>
            <DialogDescription>תוכן התבנית נשמר במסד הנתונים וזמין אחרי רענון.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-title">שם תבנית *</Label>
              <Input
                id="doc-title"
                value={formData.title}
                onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
                required
                className="border-primary/30"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-type">סוג</Label>
              <select
                id="doc-type"
                value={formData.type}
                onChange={(e) => setFormData((d) => ({ ...d, type: e.target.value as DocumentTemplateType }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="client_agreement">הסכם לקוח</option>
                <option value="artist_agreement">הסכם אמן</option>
                <option value="appearance_agreement">הסכם הופעה</option>
                <option value="invoice_template">תבנית חשבונית</option>
                <option value="other">אחר</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-send-to">שלח ל</Label>
              <select
                id="doc-send-to"
                value={formData.send_to}
                onChange={(e) => setFormData((d) => ({ ...d, send_to: e.target.value as DocumentSendTo }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="artist">אמן</option>
                <option value="client">לקוח</option>
                <option value="both">אמן ולקוח (שניהם)</option>
              </select>
              <p className="text-xs text-muted-foreground">למי לשלוח את המסמך המופק מהתבנית</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-content">תוכן (משתנים: {'{{שם}}'})</Label>
              <textarea
                id="doc-content"
                value={formData.content}
                onChange={(e) => setFormData((d) => ({ ...d, content: e.target.value }))}
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                ביטול
              </Button>
              <Button type="submit" className="btn-magenta">
                {editingDoc ? 'עדכן' : 'הוסף'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentsPage;
