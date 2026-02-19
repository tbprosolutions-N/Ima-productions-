import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserCircle, Plus, Edit, Trash2, Search, ChevronDown, ChevronUp, Mail, Phone, Palette, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Label } from '@/components/ui/Label';
import { useAgency } from '@/contexts/AgencyContext';
import { useToast } from '@/contexts/ToastContext';
import { supabase } from '@/lib/supabase';
import { demoSetArtists, demoUpsertArtist, isDemoMode } from '@/lib/demoStore';
import { useArtistsQuery, useInvalidateArtists } from '@/hooks/useSupabaseQuery';
import { useQueryClient } from '@tanstack/react-query';
import { cleanNotes } from '@/lib/notesCleanup';
import type { Artist } from '@/types';

const ARTIST_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
  '#E11D48', '#84CC16',
];

const ArtistsPage: React.FC = () => {
  const { currentAgency } = useAgency();
  const { success, error: showError } = useToast();
  const { data: artists = [], isLoading: loading } = useArtistsQuery(currentAgency?.id);
  const invalidateArtists = useInvalidateArtists();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    color: '#3B82F6',
    google_calendar_id: '',
    vat_id: '',
    bank_name: '',
    bank_branch: '',
    bank_account: '',
    amount: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const filteredArtists = artists.filter(a =>
    !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stripPayoutMetadata = cleanNotes;

  const openDialog = (artist?: Artist) => {
    if (artist) {
      setEditingArtist(artist);
      setFormData({
        name: artist.name,
        phone: artist.phone || '',
        email: artist.email || artist.calendar_email || '',
        notes: stripPayoutMetadata(artist.notes),
        color: artist.color || '#3B82F6',
        google_calendar_id: artist.google_calendar_id || '',
        vat_id: artist.vat_id || '',
        bank_name: artist.bank_name || '',
        bank_branch: artist.bank_branch || '',
        bank_account: artist.bank_account || '',
        amount: artist.amount != null ? String(artist.amount) : '',
      });
    } else {
      setEditingArtist(null);
      setFormData({
        name: '', phone: '', email: '', notes: '',
        color: '#3B82F6', google_calendar_id: '',
        vat_id: '', bank_name: '', bank_branch: '', bank_account: '', amount: '',
      });
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingArtist(null);
    setFormErrors({});
    setFormData({ name: '', phone: '', email: '', notes: '', color: '#3B82F6', google_calendar_id: '', vat_id: '', bank_name: '', bank_branch: '', bank_account: '', amount: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    const emailVal = formData.email?.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailVal && !emailRegex.test(emailVal)) {
      setEmailError('נא להזין כתובת אימייל תקינה');
      return;
    }
    const err: Record<string, string> = {};
    if (!formData.name?.trim()) err.name = 'נא להזין שם אמן';
    if (Object.keys(err).length > 0) {
      setFormErrors(err);
      showError('נא למלא את השדות החובה');
      return;
    }
    setFormErrors({});
    if (!currentAgency) {
      showError('אין סוכנות פעילה. נא לרענן את הדף או לפנות למנהל.');
      return;
    }
    setIsSaving(true);
    try {
      const cleanNotes = stripPayoutMetadata(formData.notes);
      const emailForDb = formData.email?.trim() || undefined;
      const amountNum = formData.amount.trim() ? Number(formData.amount) : null;
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone?.trim() || undefined,
        email: emailForDb,
        calendar_email: emailForDb,
        notes: cleanNotes || undefined,
        color: formData.color || undefined,
        google_calendar_id: formData.google_calendar_id || undefined,
        vat_id: formData.vat_id || undefined,
        bank_name: formData.bank_name || undefined,
        bank_branch: formData.bank_branch || undefined,
        bank_account: formData.bank_account || undefined,
        amount: Number.isFinite(amountNum) ? amountNum : undefined,
      };

      if (isDemoMode()) {
        demoUpsertArtist(currentAgency.id, payload as any, editingArtist?.id);
        success(editingArtist ? 'אמן עודכן בהצלחה' : 'אמן נוסף בהצלחה');
      } else {
        if (editingArtist) {
          const dbPayload: Record<string, any> = { ...payload, updated_at: new Date().toISOString() };
          const { error } = await supabase
            .from('artists')
            .update(dbPayload)
            .eq('id', editingArtist.id);
          if (error) throw error;
          success('אמן עודכן בהצלחה');
        } else {
          const { data: _inserted, error } = await supabase
            .from('artists')
            .insert({ agency_id: currentAgency.id, ...payload })
            .select('id')
            .single();
          if (error) throw error;
          success('אמן נוסף בהצלחה');
        }
      }
      invalidateArtists(currentAgency.id);
      await queryClient.refetchQueries({ queryKey: ['artists', currentAgency.id] });
      closeDialog();
    } catch (err: any) {
      showError(err?.message || 'אירעה שגיאה. אנא נסה שוב.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם למחוק אמן זה?')) return;
    if (!currentAgency) return;
    try {
      if (isDemoMode()) {
        const next = artists.filter((a) => a.id !== id);
        demoSetArtists(currentAgency.id, next);
        success('אמן נמחק');
      } else {
        const { error } = await supabase.from('artists').delete().eq('id', id);
        if (error) throw error;
        success('אמן נמחק');
      }
      invalidateArtists(currentAgency.id);
    } catch (err: any) {
      showError(err?.message || 'אירעה שגיאה במחיקה. אנא נסה שוב.');
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <UserCircle className="w-7 h-7 text-primary" />
            אמנים
          </h1>
          <p className="text-muted-foreground text-sm">ניהול אמנים ופרטי קשר</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש אמן..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pr-10 w-48 sm:w-64"
            />
          </div>
          <Button type="button" className="btn-magenta shrink-0 gap-2" onClick={() => openDialog()}>
            <Plus className="w-4 h-4" />
            הוסף אמן
          </Button>
        </div>
      </motion.div>

      <Card className="border-gray-100 dark:border-gray-200 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-r-transparent" />
            </div>
          ) : filteredArtists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <UserCircle className="w-16 h-16 text-muted-foreground/60 mx-auto mb-4" strokeWidth={1} />
              <p className="text-muted-foreground text-sm mb-1">{searchQuery ? 'לא נמצאו תוצאות' : 'אין נתונים להצגה'}</p>
              <p className="text-muted-foreground/80 text-sm mb-5">
                {searchQuery ? 'נסה חיפוש אחר' : 'לחץ על הוסף אמן כדי להתחיל'}
              </p>
              {!searchQuery && (
                <Button type="button" className="btn-magenta gap-2" onClick={() => openDialog()}>
                  <Plus className="w-4 h-4" />
                  הוסף אמן ראשון
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-200">
              {filteredArtists.map((artist) => (
                <div key={artist.id} className="group">
                  {/* Main Row */}
                  <div
                    className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === artist.id ? null : artist.id)}
                  >
                    {/* Color indicator */}
                    <div
                      className="w-3 h-10 rounded-full shrink-0"
                      style={{ backgroundColor: artist.color || '#3B82F6' }}
                    />
                    {/* Basic info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{artist.name}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        {artist.phone && (
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{artist.phone}</span>
                        )}
                        {(artist.email || artist.calendar_email) && (
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{artist.email || artist.calendar_email}</span>
                        )}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="min-h-[44px] min-w-[44px] shrink-0"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); openDialog(artist); }}
                        aria-label="ערוך אמן"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="min-h-[44px] min-w-[44px] shrink-0 border-red-500/30 text-red-500 hover:bg-red-500/10"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDelete(artist.id); }}
                        aria-label="מחק אמן"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      {expandedId === artist.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {/* Expanded Details */}
                  {expandedId === artist.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-4 pb-4 bg-muted/10"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-3 border-t border-gray-50 dark:border-gray-100">
                        <DetailItem icon={<Mail className="w-4 h-4" />} label="אימייל (כולל Google / יומן)" value={artist.email || artist.calendar_email} />
                        <DetailItem icon={<Phone className="w-4 h-4" />} label="טלפון" value={artist.phone} />
                        <DetailItem icon={<CreditCard className="w-4 h-4" />} label="סכום" value={artist.amount != null ? Number(artist.amount).toLocaleString('he-IL') : undefined} />
                        <DetailItem icon={<Palette className="w-4 h-4" />} label="צבע ביומן" value={
                          artist.color ? (
                            <span className="flex items-center gap-2">
                              <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: artist.color }} />
                              {artist.color}
                            </span>
                          ) : undefined
                        } />
                        <DetailItem icon={<CreditCard className="w-4 h-4" />} label="ח.פ / עוסק" value={artist.vat_id} />
                        <DetailItem icon={<CreditCard className="w-4 h-4" />} label="בנק" value={artist.bank_name ? `${artist.bank_name} סניף ${artist.bank_branch || '—'} חשבון ${artist.bank_account || '—'}` : undefined} />
                        {artist.notes && (() => {
                          const cleaned = cleanNotes(artist.notes);
                          if (!cleaned) return null;
                          return (
                            <div className="sm:col-span-2 lg:col-span-3">
                              <p className="text-xs text-muted-foreground mb-0.5">הערות</p>
                              <p className="text-sm text-foreground">{cleaned}</p>
                            </div>
                          );
                        })()}
                      </div>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Artist Dialog - Full Form */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-gray-100 dark:border-gray-200">
          <DialogHeader>
            <DialogTitle>{editingArtist ? 'עריכת אמן' : 'אמן חדש'}</DialogTitle>
            <DialogDescription>מלא את כל פרטי האמן הרלוונטיים</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Basic Info */}
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">פרטים בסיסיים</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="artist-name">שם *</Label>
                  <Input
                    id="artist-name"
                    value={formData.name}
                    onChange={(e) => { setFormData((d) => ({ ...d, name: e.target.value })); setFormErrors((prev) => ({ ...prev, name: '' })); }}
                    required
                    className={formErrors.name ? 'border-red-500 border-2' : undefined}
                  />
                  {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="artist-phone">טלפון</Label>
                  <Input
                    id="artist-phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData((d) => ({ ...d, phone: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="artist-email">אימייל (גם ל־Google Calendar ויומן)</Label>
                  <Input
                    id="artist-email"
                    type="email"
                    placeholder="artist@gmail.com"
                    value={formData.email}
                    onChange={(e) => { setFormData((d) => ({ ...d, email: e.target.value })); setEmailError(null); }}
                  />
                  <p className="text-xs text-muted-foreground">משמש לסנכרון יומן וכל שירותי Google</p>
                  {emailError && <p className="text-xs text-red-500">{emailError}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="artist-amount">סכום</Label>
                  <Input
                    id="artist-amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData((d) => ({ ...d, amount: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>צבע ביומן</Label>
                  <div className="flex flex-wrap gap-2">
                    {ARTIST_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        className={`w-7 h-7 rounded-full border-2 transition-all ${formData.color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setFormData(d => ({ ...d, color: c }))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Financial */}
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">פרטי חשבונית ובנק</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="artist-vat">ח.פ / עוסק מורשה</Label>
                  <Input
                    id="artist-vat"
                    value={formData.vat_id}
                    onChange={(e) => setFormData((d) => ({ ...d, vat_id: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="artist-bank">שם בנק</Label>
                  <Input
                    id="artist-bank"
                    value={formData.bank_name}
                    onChange={(e) => setFormData((d) => ({ ...d, bank_name: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="artist-branch">סניף</Label>
                  <Input
                    id="artist-branch"
                    value={formData.bank_branch}
                    onChange={(e) => setFormData((d) => ({ ...d, bank_branch: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="artist-account">מספר חשבון</Label>
                  <Input
                    id="artist-account"
                    value={formData.bank_account}
                    onChange={(e) => setFormData((d) => ({ ...d, bank_account: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="artist-notes">הערות</Label>
              <Input
                id="artist-notes"
                value={formData.notes}
                onChange={(e) => setFormData((d) => ({ ...d, notes: e.target.value }))}
                placeholder="הערות חופשיות..."
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                ביטול
              </Button>
              <Button type="submit" className="btn-magenta" disabled={isSaving}>
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    שומר...
                  </span>
                ) : editingArtist ? 'עדכן' : 'הוסף'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* Detail item for expanded view */
const DetailItem: React.FC<{ icon: React.ReactNode; label: string; value?: string | React.ReactNode }> = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{typeof value === 'string' ? value : value}</p>
      </div>
    </div>
  );
};

export default ArtistsPage;
