import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserCircle, Plus, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Label } from '@/components/ui/Label';
import { useAgency } from '@/contexts/AgencyContext';
import { useToast } from '@/contexts/ToastContext';
import { supabase } from '@/lib/supabase';
import { demoGetArtists, demoSetArtists, demoUpsertArtist, isDemoMode } from '@/lib/demoStore';
import type { Artist } from '@/types';

const ArtistsPage: React.FC = () => {
  const { currentAgency } = useAgency();
  const { success, error: showError } = useToast();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', company_name: '', notes: '' });

  useEffect(() => {
    if (!currentAgency) return;
    const load = async () => {
      setLoading(true);
      if (isDemoMode()) {
        setArtists(demoGetArtists(currentAgency.id));
      } else {
        const { data, error } = await supabase
          .from('artists')
          .select('*')
          .eq('agency_id', currentAgency.id)
          .order('name', { ascending: true });
        if (error) {
          showError('טעינת האמנים נכשלה. אנא נסה שוב.');
          setArtists([]);
        } else {
          setArtists((data || []) as Artist[]);
        }
      }
      setLoading(false);
    };
    load();
  }, [currentAgency?.id]);

  const openDialog = (artist?: Artist) => {
    if (artist) {
      setEditingArtist(artist);
      setFormData({
        name: artist.name,
        phone: artist.phone || '',
        email: artist.email || '',
        company_name: artist.company_name || '',
        notes: artist.notes || '',
      });
    } else {
      setEditingArtist(null);
      setFormData({ name: '', phone: '', email: '', company_name: '', notes: '' });
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingArtist(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgency) return;
    try {
      if (isDemoMode()) {
        const updated = demoUpsertArtist(
          currentAgency.id,
          {
            name: formData.name,
            phone: formData.phone || undefined,
            email: formData.email || undefined,
            company_name: formData.company_name || undefined,
            notes: formData.notes || undefined,
          },
          editingArtist?.id
        );
        const list = editingArtist
          ? artists.map((a) => (a.id === editingArtist.id ? { ...updated, created_at: a.created_at } : a))
          : [updated, ...artists];
        demoSetArtists(currentAgency.id, list);
        setArtists(list);
        success(editingArtist ? 'אמן עודכן בהצלחה' : 'אמן נוסף בהצלחה');
      } else {
        if (editingArtist) {
          const { error } = await supabase
            .from('artists')
            .update({
              name: formData.name,
              phone: formData.phone || null,
              email: formData.email || null,
              notes: formData.notes || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', editingArtist.id);
          if (error) throw error;
          success('אמן עודכן בהצלחה');
        } else {
          const { error } = await supabase.from('artists').insert({
            agency_id: currentAgency.id,
            name: formData.name,
            phone: formData.phone || null,
            email: formData.email || null,
            notes: formData.notes || null,
          });
          if (error) throw error;
          success('אמן נוסף בהצלחה');
        }
        const { data } = await supabase
          .from('artists')
          .select('*')
          .eq('agency_id', currentAgency.id)
          .order('name', { ascending: true });
        setArtists((data || []) as Artist[]);
      }
      closeDialog();
    } catch (err: any) {
      showError(err?.message || 'אירעה שגיאה. אנא נסה שוב.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם למחוק אמן זה?')) return;
    if (!currentAgency) return;
    try {
      if (isDemoMode()) {
        const next = artists.filter((a) => a.id !== id);
        demoSetArtists(currentAgency.id, next);
        setArtists(next);
        success('אמן נמחק');
      } else {
        const { error } = await supabase.from('artists').delete().eq('id', id);
        if (error) throw error;
        setArtists((prev) => prev.filter((a) => a.id !== id));
        success('אמן נמחק');
      }
    } catch (err: any) {
      showError(err?.message || 'אירעה שגיאה במחיקה. אנא נסה שוב.');
    }
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <UserCircle className="w-8 h-8 text-primary" />
            אמנים
          </h1>
          <p className="text-muted-foreground">ניהול אמנים</p>
        </div>
        <Button type="button" className="btn-magenta shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2 hover:opacity-90" onClick={() => openDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          הוסף אמן
        </Button>
      </motion.div>

      <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader className="p-5 md:p-6" />
        <CardContent className="p-5 md:p-6 pt-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-r-transparent" />
            </div>
          ) : artists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <UserCircle className="w-16 h-16 text-muted-foreground/60 mx-auto mb-4" strokeWidth={1} />
              <p className="text-muted-foreground text-sm mb-1">אין נתונים להצגה</p>
              <p className="text-muted-foreground/80 text-sm mb-5">לחץ על הוסף אמן כדי להתחיל</p>
              <Button type="button" className="btn-magenta focus-visible:ring-2 focus-visible:ring-offset-2" onClick={() => openDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                הוסף אמן ראשון
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-gray-100 dark:border-gray-800 bg-muted/50">
                  <tr>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">שם</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">קטגוריה / חברה</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">טלפון</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">אימייל</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {artists.map((artist) => (
                    <tr key={artist.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{artist.name}</td>
                      <td className="p-3 text-muted-foreground">{artist.company_name || '—'}</td>
                      <td className="p-3 text-muted-foreground">{artist.phone || '—'}</td>
                      <td className="p-3 text-muted-foreground">{artist.email || '—'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-gray-200 dark:border-gray-700 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-offset-2"
                            onClick={() => openDialog(artist)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-red-500/30 text-red-500 hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-offset-2"
                            onClick={() => handleDelete(artist.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md border-gray-100 dark:border-gray-800 shadow-sm">
          <DialogHeader>
            <DialogTitle>{editingArtist ? 'עריכת אמן' : 'אמן חדש'}</DialogTitle>
            <DialogDescription>מלא פרטי אמן</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <Label htmlFor="artist-name">שם *</Label>
              <Input
                id="artist-name"
                value={formData.name}
                onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                required
                className="border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label htmlFor="artist-company">קטגוריה / חברה</Label>
              <Input
                id="artist-company"
                value={formData.company_name}
                onChange={(e) => setFormData((d) => ({ ...d, company_name: e.target.value }))}
                className="border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label htmlFor="artist-phone">טלפון</Label>
              <Input
                id="artist-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((d) => ({ ...d, phone: e.target.value }))}
                className="border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label htmlFor="artist-email">אימייל</Label>
              <Input
                id="artist-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
                className="border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label htmlFor="artist-notes">הערות</Label>
              <Input
                id="artist-notes"
                value={formData.notes}
                onChange={(e) => setFormData((d) => ({ ...d, notes: e.target.value }))}
                className="border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="outline" className="hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-offset-2" onClick={closeDialog}>
                ביטול
              </Button>
              <Button type="submit" className="btn-magenta focus-visible:ring-2 focus-visible:ring-offset-2 hover:opacity-90">
                {editingArtist ? 'עדכן' : 'הוסף'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ArtistsPage;
