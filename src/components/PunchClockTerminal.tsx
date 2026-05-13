import { useState } from 'react';
import { X, Delete } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { format } from 'date-fns';
import { getTranslations } from '../utils/translations';
import { usePunchPresenceVerification } from '../hooks/usePunchPresenceVerification';

interface PunchClockTerminalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PunchClockTerminal({ isOpen, onClose }: PunchClockTerminalProps) {
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const { users, addPunchRecord, effectiveLanguage, showError } = useApp();
  const { requestProof, modal: presenceModal } = usePunchPresenceVerification(effectiveLanguage);
  const t = getTranslations(effectiveLanguage);

  const handleNumber = (num: string) => {
    if (pin.length < 4) {
      setPin(pin + num);
    }
  };

  const handleClear = () => {
    setPin('');
    setMessage('');
  };

  const handleSubmit = async () => {
    const user = users.find((u) => u.pin === pin);

    if (!user) {
      setMessageType('error');
      setMessage(t.pin_invalid);
      setTimeout(() => {
        setPin('');
        setMessage('');
      }, 2000);
      return;
    }

    if (user.status !== 'active') {
      setMessageType('error');
      setMessage(t.user_suspended_punch);
      setTimeout(() => {
        setPin('');
        setMessage('');
      }, 2000);
      return;
    }

    let presenceProof: string | undefined;
    try {
      const proof = await requestProof(user.id);
      presenceProof = proof || undefined;
    } catch (e) {
      if (e instanceof Error && e.message === 'presence_cancelled') {
        setMessageType('error');
        setMessage(t.punch_presence_cancelled);
        showError?.(t.punch_presence_cancelled);
        setTimeout(() => {
          setPin('');
          setMessage('');
        }, 3500);
        return;
      }
      throw e;
    }
    const pr = await addPunchRecord(user.id, 'in', { presenceProof });
    if (pr && typeof pr === 'object' && 'error' in pr && pr.error) {
      setMessageType('error');
      setMessage(pr.error);
      showError?.(pr.error);
      setTimeout(() => {
        setPin('');
        setMessage('');
      }, 3500);
      return;
    }
    setMessageType('success');
    setMessage(t.punch_entry_success);

    setTimeout(() => {
      setPin('');
      setMessage('');
      onClose();
    }, 1500);
  };

  const buttons = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    'C', '0', 'OK'
  ];

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1A1A1A] rounded-[56px] w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="bg-accent dark:bg-accent/90 p-8 relative">
              <button
                onClick={onClose}
                className="absolute top-6 right-6 w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>

              <div className="text-center">
                <h2 className="text-white text-2xl font-black uppercase tracking-wider mb-2">
                  Terminale Presenze
                </h2>
                <p className="text-white/80 text-sm">
                  {format(new Date(), 'HH:mm - dd/MM/yyyy')}
                </p>
              </div>
            </div>

            <div className="p-8">
              <div className="mb-8">
                <p className="text-[#A0A0A0] dark:text-gray-400 text-xs uppercase tracking-[0.2em] font-bold mb-3 text-center">
                  Inserisci PIN
                </p>
                <div className="flex justify-center space-x-3 mb-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center ${
                        pin.length > i
                          ? 'border-accent bg-accent'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                      }`}
                    >
                      {pin.length > i && (
                        <div className="w-4 h-4 rounded-full bg-white" />
                      )}
                    </div>
                  ))}
                </div>

                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`text-center text-sm font-bold ${
                      messageType === 'success' ? 'text-accent' : 'text-red-500'
                    }`}
                  >
                    {message}
                  </motion.div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {buttons.map((btn) => {
                  if (btn === 'C') {
                    return (
                      <button
                        key={btn}
                        onClick={handleClear}
                        className="aspect-square rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-95"
                      >
                        <Delete className="w-6 h-6 text-[#1A1A1A] dark:text-white" />
                      </button>
                    );
                  }

                  if (btn === 'OK') {
                    return (
                      <button
                        key={btn}
                        onClick={handleSubmit}
                        disabled={pin.length !== 4}
                        className="aspect-square rounded-2xl bg-accent flex items-center justify-center hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                      >
                        <span className="text-white text-xl font-black">OK</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={btn}
                      onClick={() => handleNumber(btn)}
                      className="aspect-square rounded-2xl bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-accent hover:bg-accent/5 transition-all active:scale-95"
                    >
                      <span className="text-[#1A1A1A] dark:text-white text-2xl font-black">{btn}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    {presenceModal}
    </>
  );
}
