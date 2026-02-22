import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    const id = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11));
    const toast: Toast = { id, type, message, duration };
    
    setToasts(prev => [...prev, toast]);
    
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const success = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const error = useCallback((message: string) => showToast(message, 'error'), [showToast]);
  const warning = useCallback((message: string) => showToast(message, 'warning'), [showToast]);
  const info = useCallback((message: string) => showToast(message, 'info'), [showToast]);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return CheckCircle;
      case 'error': return XCircle;
      case 'warning': return AlertCircle;
      case 'info': return Info;
    }
  };

  const getStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'bg-green-500/15 border-green-500/40';
      case 'error':
        return 'bg-red-500/15 border-red-500/40';
      case 'warning':
        return 'bg-yellow-500/15 border-yellow-500/40';
      case 'info':
        return 'bg-blue-500/15 border-blue-500/40';
    }
  };

  const getIconColor = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      case 'warning':
        return 'text-yellow-500';
      case 'info':
        return 'text-blue-500';
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed top-4 left-4 z-50 space-y-2 pointer-events-none" dir="rtl">
        {toasts.map(toast => {
          const Icon = getIcon(toast.type);
          const styles = getStyles(toast.type);
          const iconColor = getIconColor(toast.type);
          
          return (
            <div
              key={toast.id}
              className={`animate-toastIn pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border ${styles} backdrop-blur-md shadow-2xl min-w-[300px] max-w-md text-foreground`}
            >
                <Icon className={`w-5 h-5 flex-shrink-0 ${iconColor}`} />
                <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="flex-shrink-0 rounded hover:opacity-70 transition-opacity text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
