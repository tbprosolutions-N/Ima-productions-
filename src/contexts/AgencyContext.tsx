import React, { createContext, useContext, useState, useEffect } from 'react';
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
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

export const AgencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currentAgency, setCurrentAgency] = useState<Agency | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);

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

      // Safety: if user has no agency_id yet, don't query.
      if (!user?.agency_id) {
        setAgencies([]);
        setCurrentAgency(null);
        setLoading(false);
        return;
      }
      
      // Fast path: this schema is single-agency-per-user (users.agency_id).
      // Fetch only the user's agency to avoid unnecessary network/RLS work.
      const { data, error } = await withTimeout<any>(
        supabase.from('agencies').select('*').eq('id', user.agency_id).maybeSingle() as any,
        5000,
        'Fetch agency'
      );

      if (error) throw error;

      const list = data ? [data] : [];
      setAgencies(list);

      // Set current agency from localStorage or default to user's agency
      const savedAgencyId = localStorage.getItem('currentAgencyId');
      if (savedAgencyId && data?.id === savedAgencyId) {
        setCurrentAgency(data);
      } else {
        setCurrentAgency(data || null);
      }
    } catch (error) {
      console.error('Error fetching agencies:', error);
      // DEMO fallback (still allow app to function)
      if (isDemoMode()) {
        setAgencies([DEMO_AGENCY]);
        setCurrentAgency(DEMO_AGENCY);
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

  return (
    <AgencyContext.Provider value={{ currentAgency, agencies, switchAgency, loading }}>
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
