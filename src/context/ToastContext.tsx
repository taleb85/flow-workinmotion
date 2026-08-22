import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ToastContextValue {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  toastMessage: string;
  toastType: 'success' | 'error' | '';
  clearToast: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | ''>('');

  const clearToast = useCallback(() => {
    setToastMessage('');
    setToastType('');
  }, []);

  const showError = useCallback((message: string) => {
    setToastMessage(message);
    setToastType('error');
  }, []);

  const showSuccess = useCallback((message: string) => {
    setToastMessage(message);
    setToastType('success');
  }, []);

  return (
    <ToastContext.Provider value={{ showError, showSuccess, toastMessage, toastType, clearToast }}>
      {children}
    </ToastContext.Provider>
  );
}
