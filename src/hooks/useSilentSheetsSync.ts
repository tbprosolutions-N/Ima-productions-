/**
 * Silent background Sheets sync — triggers when user loads Dashboard or Events.
 * If >24h since last sync (or never synced), runs resync in background.
 * Subtle toast on success; "Re-connect Google" prompt only on token error.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAgency } from '@/contexts/AgencyContext';
import { useToast } from '@/contexts/ToastContext';
import { checkAndTriggerSilentSync } from '@/services/sheetsSyncClient';

const TRIGGER_PATHS = ['/dashboard', '/events'];

export function useSilentSheetsSync(): void {
  const { currentAgency } = useAgency();
  const { showToast, error: showError } = useToast();
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (!TRIGGER_PATHS.includes(path)) return;

    const agencyId = currentAgency?.id;
    if (!agencyId) return;

    checkAndTriggerSilentSync(agencyId, {
      onSuccess: () => {
        showToast('גיבוי עודכן', 'success', 2000);
      },
      onTokenError: () => {
        showError('נדרש חיבור מחדש ל־Google. עבור/י להגדרות → גיבוי נתונים.');
      },
      onError: (message) => {
        showError(message + ' — נסה גיבוי יזום בהגדרות → גיבוי נתונים.');
      },
    });
  }, [location.pathname, currentAgency?.id, showToast, showError]);
}
