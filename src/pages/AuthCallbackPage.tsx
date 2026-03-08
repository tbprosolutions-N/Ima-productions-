/**
 * AuthCallbackPage — handles Google OAuth PKCE callback.
 * Supabase redirects here with ?code=xxx. We wait for user from AuthContext
 * (after fetchUserProfile completes) before navigating to /dashboard.
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    if (user) {
      doneRef.current = true;
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (doneRef.current) return;
      if (!user && !loading) {
        doneRef.current = true;
        navigate('/login', { replace: true });
      }
    }, 18000);
    return () => clearTimeout(t);
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center p-2">
          <img src="/logo.svg" alt="NPC" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">מתחבר...</h1>
        <div className="flex justify-center">
          <svg className="animate-spin h-7 w-7 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default AuthCallbackPage;
