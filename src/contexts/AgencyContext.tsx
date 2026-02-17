import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  const { user } = useAuth();
  const [currentAgency, setCurrentAgency] = useState<Agency | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyError, setAgencyError] = useState<string | null>(null);

  const fetchAgencies = React.useCallback(async () => {
    try {
      setLoading(true);

      // DEMO MODE: no Supabase dependency
      if (isDemoMode()) {
        setAgencies([DEMO_AGENCY]);
        setCurrentAgency(DEMO_AGENCY);
        setLoading(false);
        return;
      }

      // Safety: if user has no agency_id yet, try to provision via ensure_user_profile first.
      // This handles the edge-case where a new user signed in but the trigger didn't fire properly.
      // Use a local mutable reference so we can update agency_id without mutating the context object.
      let resolvedUser = user;
      if (!resolvedUser?.agency_id) {
        try {
          if (import.meta.env.DEV) console.debug('[Agency] user.agency_id missing — attempting ensure_user_profile bootstrap');
          await withTimeout<any>(
            supabase.rpc('ensure_user_profile', { company_code: null }) as any,
            8000,
            'ensure_user_profile (agency bootstrap)'
          );
          // Re-fetch profile after provisioning
          const { data: refreshed } = await withTimeout<any>(
            supabase.from('users').select('agency_id').eq('id', resolvedUser!.id).single() as any,
            5000,
            'Re-fetch user after bootstrap'
          );
          if (!refreshed?.agency_id) {
            setAgencies([]);
            setCurrentAgency(null);
            setAgencyError('לחשבון שלך לא משויכת סוכנות. פנה למנהל המערכת.');
            setLoading(false);
            return;
          }
          // Provisioned — update the local reference so the rest of this function can proceed
          resolvedUser = { ...resolvedUser!, agency_id: refreshed.agency_id };
        } catch (provErr) {
          console.warn('[Agency] Bootstrap provisioning failed:', provErr);
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
        supabase.from('agencies').select('*').eq('id', resolvedUser!.agency_id).maybeSingle() as any,
        5000,
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
    } catch (error) {
      console.error('Error fetching agencies:', error);
      setAgencies([]);
      setCurrentAgency(null);
      setAgencyError('טעינת הסוכנות נכשלה. נסה לרענן את הדף או פנה למנהל.');
      if (isDemoMode()) {
        setAgencies([DEMO_AGENCY]);
        setCurrentAgency(DEMO_AGENCY);
        setAgencyError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchAgencies();
    } else {
      setCurrentAgency(null);
      setAgencies([]);
      setAgencyError(null);
      setLoading(false);
    }
  }, [user, fetchAgencies]);

  const switchAgency = (agencyId: string) => {
    const agency = agencies.find(a => a.id === agencyId);
    if (agency) {
      setCurrentAgency(agency);
      localStorage.setItem('currentAgencyId', agencyId);
    }
  };

  const retryAgency = useCallback(() => {
    setAgencyError(null);
    fetchAgencies();
  }, [fetchAgencies]);

  return (
    <AgencyContext.Provider value={{ currentAgency, agencies, switchAgency, loading, agencyError, retryAgency }}>
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
