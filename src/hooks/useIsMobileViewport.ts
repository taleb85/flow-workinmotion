import { useState, useEffect } from 'react';
import { isMobileLayout } from '../utils/layoutPreset';

const isMobileCheck = () =>
  isMobileLayout() || window.matchMedia('(pointer: coarse)').matches;

export const useIsMobileViewport = () => {
  const [isMobile, setIsMobile] = useState(isMobileCheck);
  useEffect(() => {
    const touchMq = window.matchMedia('(pointer: coarse)');
    const update = () => setIsMobile(isMobileCheck());
    window.addEventListener('resize', update);
    touchMq.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      touchMq.removeEventListener('change', update);
    };
  }, []);
  return isMobile;
};
