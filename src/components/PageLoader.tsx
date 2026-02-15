import { useState, useEffect } from 'react';

/** Shows spinner immediately; after 500ms adds a subtle top progress bar so users know the app isn't stuck */
export default function PageLoader({ label = 'טוען…' }: { label?: string }) {
  const [showProgressBar, setShowProgressBar] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowProgressBar(true), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-background relative">
      {showProgressBar && (
        <div
          className="fixed top-0 left-0 right-0 h-1 bg-primary/20 z-50 overflow-hidden"
          role="progressbar"
          aria-valuetext="טוען"
        >
          <div
            className="h-full w-1/3 bg-primary rounded-r-full"
            style={{ animation: 'pageLoadProgress 1.5s ease-in-out infinite' }}
          />
        </div>
      )}
      <style>{`
        @keyframes pageLoadProgress {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(400%); }
        }
      `}</style>
      <div className="text-center">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-slate-300 border-r-slate-900 dark:border-slate-600 dark:border-r-primary" />
        <p className="mt-4 text-slate-900 dark:text-foreground font-medium">{label}</p>
      </div>
    </div>
  );
}

