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

  /* Ultimo controllo cliccato: il fumetto si aggancia all'elemento che ha generato
     l'azione (sezione con data-toast-anchor, altrimenti il bottone/controllo stesso),
     seguendolo anche durante lo scroll. */
  const lastClickedAnchor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest) {
        lastClickedAnchor.current = null;
        return;
      }
      const sectionAnchor = target.closest('[data-toast-anchor]') as HTMLElement | null;
      if (sectionAnchor) {
        lastClickedAnchor.current = sectionAnchor;
        return;
      }
      const control = target.closest(
        'button, a, [role="switch"], input, select, textarea, label'
      ) as HTMLElement | null;
      lastClickedAnchor.current = control ?? target;
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
