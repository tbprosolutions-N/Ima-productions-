import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { Agency } from '@/types';
import { DEMO_AGENCY, isDemoMode } from '@/lib/demoStore';
import { withTimeout } from '@/lib/utils';

interface AgencyContextType {
  currentAgency: Agency | null;
  agencies: Agency[];
  switchAgency: (agencyId: string) => void;
  loading: boolean;
  /** Set when user exists but agency fetch failed or user has no agency_id — main features will not work until resolved */
  agencyError: string | null;
  /** Retry loading agency (e.g. after fixing network or admin assigning agency) */
  retryAgency: () => void;
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

export const AgencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [currentAgency, setCurrentAgency] = useState<Agency | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyError, setAgencyError] = useState<string | null>(null);
  const retryCountRef = React.useRef(0);
  const MAX_RETRIES = 2;

  const fetchAgencies = React.useCallback(async () => {
    try {
      setLoading(true);
      setAgencyError(null);

      // DEMO MODE: no Supabase dependency
      if (isDemoMode()) {
        setAgencies([DEMO_AGENCY]);
        setCurrentAgency(DEMO_AGENCY);
        setLoading(false);
        return;
      }

      // Require user with id before any fetch — prevents "טעינת הסוכנות נכשלה" from missing context
      if (!user?.id) {
        setAgencies([]);
        setCurrentAgency(null);
        setLoading(false);
        return;
      }
      // Safety: if user has no agency_id yet, try to provision via ensure_user_profile first.
      let resolvedUser = user;
      if (!resolvedUser.agency_id) {
        // Attempt to provision profile via RPC (handles first-time users / bootstrap).
        // If the RPC doesn't exist in this DB environment yet, we fall through to
        // the "no agency" error path rather than crashing — non-fatal by design.
        try {
          await withTimeout<any>(
            supabase.rpc('ensure_user_profile', { company_code: null }) as any,
            12000,
            'ensure_user_profile'
          );
          const { data: refreshed } = await withTimeout<any>(
            supabase.from('users').select('agency_id').eq('id', resolvedUser!.id).single() as any,
            8000,
            'Re-fetch user after bootstrap'
          );
          if (refreshed?.agency_id) {
            resolvedUser = { ...resolvedUser!, agency_id: refreshed.agency_id };
          }
        } catch (provErr: any) {
          // RPC may not exist in this environment yet — log but don't block
          const msg = String(provErr?.message || provErr || '');
          const isRpcMissing = msg.includes('Could not find') || msg.includes('does not exist') || msg.includes('42883');
          if (!isRpcMissing) void msg;
        }
        // If still no agency_id after best-effort provisioning, show error banner
        if (!resolvedUser?.agency_id) {
          setAgencies([]);
          setCurrentAgency(null);
          setAgencyError('לחשבון שלך לא משויכת סוכנות. פנה למנהל המערכת.');
          setLoading(false);
          return;
        }
      }

      setAgencyError(null);
      // Fast path: this schema is single-agency-per-user (users.agency_id).
      const { data, error } = await withTimeout<any>(
        supabase.from('agencies').select('id,name,type,settings,created_at,updated_at').eq('id', resolvedUser!.agency_id).maybeSingle() as any,
        10000,
        'Fetch agency'
      );

      if (error) throw error;

      const list = data ? [data] : [];
      setAgencies(list);
      if (!data) {
        setCurrentAgency(null);
        setAgencyError('לא נמצאה סוכנות. פנה למנהל המערכת.');
      } else {
        setAgencyError(null);
        const savedAgencyId = localStorage.getItem('currentAgencyId');
        if (savedAgencyId && data?.id === savedAgencyId) {
          setCurrentAgency(data);
        } else {
          setCurrentAgency(data);
        }
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.warn('[AgencyContext] fetchAgencies failed:', msg);
      setAgencies([]);
      setCurrentAgency(null);
      const isTimeout = msg.includes('timed out') || msg.includes('timeout');
      const isNetwork = msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch');
      setAgencyError(isTimeout || isNetwork
        ? 'חיבור נכשל. בדוק את הרשת ולחץ על "נסה שוב".'
        : 'טעינת הסוכנות נכשלה. נסה לרענן את הדף או פנה למנהל.');
      if (isDemoMode()) {
        setAgencies([DEMO_AGENCY]);
        setCurrentAgency(DEMO_AGENCY);
        setAgencyError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [user, refreshUser]);

  // Gate on Auth: do NOT fetch until Auth has finished loading. Fixes race where
  // AgencyContext ran before user.agency_id was available, causing "טעינת הסוכנות נכשלה".
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setCurrentAgency(null);
      setAgencies([]);
      setAgencyError(null);
      setLoading(false);
      return;
    }
    retryCountRef.current = 0;
    fetchAgencies();
  }, [user, authLoading, fetchAgencies]);

  // Auto-retry on transient failure (RLS propagation, network blip). Max 2 retries.
  useEffect(() => {
    if (!agencyError || !user || authLoading) return;
    if (retryCountRef.current >= MAX_RETRIES) return;
    const t = setTimeout(() => {
      retryCountRef.current += 1;
      setAgencyError(null);
      fetchAgencies();
    }, 1500);
    return () => clearTimeout(t);
  }, [agencyError, user, authLoading, fetchAgencies]);

  const switchAgency = useCallback((agencyId: string) => {
    const agency = agencies.find(a => a.id === agencyId);
    if (agency) {
      setCurrentAgency(agency);
      localStorage.setItem('currentAgencyId', agencyId);
    }
  }, [agencies]);

  const retryAgency = useCallback(async () => {
    retryCountRef.current = 0;
    setAgencyError(null);
    if (!isDemoMode() && user) {
      try {
        await refreshUser();
      } catch {
        // Non-fatal: proceed with fetch
      }
    }
    fetchAgencies();
  }, [fetchAgencies, user, refreshUser]);

  const value = useMemo(() => ({
    currentAgency,
    agencies,
    switchAgency,
    loading,
    agencyError,
    retryAgency,
  }), [currentAgency, agencies, switchAgency, loading, agencyError, retryAgency]);

  return (
    <AgencyContext.Provider value={value}>
      {children}
    </AgencyContext.Provider>
  );
};

export const useAgency = () => {
  const context = useContext(AgencyContext);
  if (context === undefined) {
    throw new Error('useAgency must be used within an AgencyProvider');
  }
  return context;
};
