import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demoStore';

const SetupWizard: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { user } = useAuth();
  const { success } = useToast();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleComplete = async () => {
    setLoading(true);
    setShowSuccess(true);
    success('המערכת הוגדרה בהצלחה! 🎉');
    
    // Try to update if user exists (skip in demo mode)
    if (user && !isDemoMode()) {
      try {
        await supabase
          .from('users')
          .update({ onboarded: true })
          .eq('id', user.id);
      } catch (error) {
        void error;
      }
    }
    
    // Always redirect after 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    onComplete();
    window.location.assign('/dashboard');
  };

  return (
    <div className="min-h-screen auth-page-bg flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl"
      >
        <Card className="glass border-primary/20">
          <CardHeader className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="mx-auto w-20 h-20 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center shadow-2xl mb-4"
            >
              {showSuccess ? (
                <Check className="w-10 h-10 text-white" />
              ) : (
                <Sparkles className="w-10 h-10 text-white animate-pulse" />
              )}
            </motion.div>
            <CardTitle className="text-3xl font-bold text-foreground">
              {showSuccess ? 'הכל מוכן!' : 'ברוכים הבאים ל-NPC'}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-lg mt-2">
              {showSuccess ? 'מעביר אותך למערכת...' : 'מערכת ניהול הפקות מתקדמת לשנת 2026'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center space-y-4 py-8">
              <p className="text-xl text-foreground">
                המערכת שלך מוכנה לשימוש
              </p>
              <p className="text-muted-foreground">
                כל מה שצריך כדי לנהל אירועים, אמנים ולקוחות במקום אחד
              </p>
            </div>

            <Button 
              onClick={handleComplete} 
              disabled={loading || showSuccess} 
              className="w-full btn-magenta text-lg py-6"
            >
              {loading || showSuccess ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {showSuccess ? 'מעביר למערכת...' : 'מכין...'}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  התחל לעבוד
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default SetupWizard;
