import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

interface ToastContextValue {
  showError: (message: string, anchor?: HTMLElement | null) => void;
  showSuccess: (message: string, anchor?: HTMLElement | null) => void;
  toastMessage: string;
  toastType: 'success' | 'error' | '';
  toastAnchor: HTMLElement | null;
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
  const [toastAnchor, setToastAnchor] = useState<HTMLElement | null>(null);

  /* Ultima sezione cliccata (elemento con data-toast-anchor): il fumetto si aggancia alla
     sezione che ha generato l'azione, seguendola anche durante lo scroll. */
  const lastClickedAnchor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      lastClickedAnchor.current = target?.closest?.('[data-toast-anchor]') ?? null;
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  const clearToast = useCallback(() => {
    setToastMessage('');
    setToastType('');
    setToastAnchor(null);
  }, []);

  const showError = useCallback((message: string, anchor?: HTMLElement | null) => {
    setToastMessage(message);
    setToastType('error');
    setToastAnchor(anchor === undefined ? lastClickedAnchor.current : anchor);
  }, []);

  const showSuccess = useCallback((message: string, anchor?: HTMLElement | null) => {
    setToastMessage(message);
    setToastType('success');
    setToastAnchor(anchor === undefined ? lastClickedAnchor.current : anchor);
  }, []);

  return (
    <ToastContext.Provider value={{ showError, showSuccess, toastMessage, toastType, toastAnchor, clearToast }}>
      {children}
    </ToastContext.Provider>
  );
}
