import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useAppConfig } from '../context/appSliceContexts';
import { useAppUser } from '../context/appSliceContexts';
import { useTenant } from '../context/TenantContext';
import type { Language } from '../types';
import { getTranslations } from '../utils/translations';
import { resolveEffectiveVerificationToken } from '../utils/presenceVerificationPayload';
import { verifyPresenceProofScanned } from '../utils/presenceProofVerification';
import { readCachedPresenceProof, writeCachedPresenceProof, clearCachedPresenceProof } from '../utils/presenceProofCache';
import PunchPresenceVerificationModal from '../components/PunchPresenceVerificationModal';

/**
 * Se la verifica QR è attiva, apre la modale e restituisce il payload letto; altrimenti stringa vuota.
 * Il manager che timbra per un altro dipendente è escluso (come per il geofence).
 *
 * La fotocamera non viene più aperta a ogni timbratura: una volta che il QR è stato
 * letto con successo, la prova resta valida per la sessione corrente (vedi
 * `presenceProofCache`) e viene riutilizzata finché token/sede/scadenza non cambiano.
 */
export function usePunchPresenceVerification(language: Language) {
  const { presenceVerificationConfig } = useAppConfig();
  const { currentUser } = useAppUser();
  const { tenantSlug } = useTenant();
  const [modalOpen, setModalOpen] = useState(false);
  const resolverRef = useRef<((value: string) => void) | null>(null);
  const rejecterRef = useRef<(() => void) | null>(null);
  const modalId = useId();
  const readerId = `punch-qr-reader-${modalId.replace(/:/g, '')}`;

  const effectiveToken = resolveEffectiveVerificationToken(presenceVerificationConfig);
  const requireVerification = presenceVerificationConfig.requireVerification === true;

  const needsModal = useCallback(
    (punchUserId: string) => {
      const managerBypass = !!(currentUser && currentUser.id !== punchUserId);
      if (managerBypass) return false;
      // Se la verifica QR non è attiva, non serve la fotocamera.
      if (!requireVerification) return false;
      // Senza token configurato non c'è nulla da confrontare: lascia che addPunchRecord
      // restituisca l'errore "non configurato" invece di aprire inutilmente la fotocamera.
      if (!effectiveToken) return false;
      return true;
    },
    [currentUser, requireVerification, effectiveToken]
  );

  const buildScope = useCallback(
    (punchUserId: string) => ({
      userId: punchUserId,
      token: effectiveToken,
      tenantSlug: tenantSlug ?? '',
    }),
    [effectiveToken, tenantSlug]
  );

  const openModal = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      resolverRef.current = resolve;
      rejecterRef.current = () => reject(new Error('presence_cancelled'));
      setModalOpen(true);
    });
  }, []);

  const requestProof = useCallback(
    async (punchUserId: string): Promise<string> => {
      if (!needsModal(punchUserId)) {
        return '';
      }
      // Riusa la prova già letta in questa sessione, se ancora valida: così la
      // fotocamera (e la richiesta di accesso) non compare a ogni timbratura.
      const scope = buildScope(punchUserId);
      const cached = readCachedPresenceProof(scope);
      if (cached) {
        const v = await verifyPresenceProofScanned(cached, effectiveToken, scope.tenantSlug);
        if (v.ok) {
          if (import.meta.env.DEV) {
            console.info('[presence-proof] riuso prova QR dalla cache: fotocamera non richiesta');
          }
          return cached;
        }
        clearCachedPresenceProof(scope);
      }
      return openModal();
    },
    [needsModal, buildScope, effectiveToken, openModal]
  );

  const handleVerified = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (import.meta.env.DEV) {
        console.info('[presence-proof] QR letto dalla fotocamera; validazione firma/token in addPunchRecord', {
          length: trimmed.length,
          prefix: trimmed.slice(0, 24),
        });
      }
      // Memorizza per riuso nelle timbrature successive della stessa sessione.
      if (currentUser?.id && trimmed) {
        writeCachedPresenceProof(buildScope(currentUser.id), trimmed);
      }
      setModalOpen(false);
      resolverRef.current?.(trimmed);
      resolverRef.current = null;
      rejecterRef.current = null;
    },
    [currentUser?.id, buildScope]
  );

  const handleCancel = useCallback(() => {
    setModalOpen(false);
    rejecterRef.current?.();
    resolverRef.current = null;
    rejecterRef.current = null;
  }, []);

  const t = getTranslations(language);

  const modal = useMemo(
    () => (
      <PunchPresenceVerificationModal
        open={modalOpen}
        onClose={handleCancel}
        onVerified={handleVerified}
        qrContainerId={readerId}
        language={language}
        title={t.punch_presence_modal_title}
        subtitle={t.punch_presence_modal_subtitle}
      />
    ),
    [modalOpen, handleCancel, handleVerified, readerId, language, t.punch_presence_modal_title, t.punch_presence_modal_subtitle]
  );

  return { requestProof, needsModal, modal, effectiveToken };
}
