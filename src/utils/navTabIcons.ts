import { LayoutDashboard, CalendarDays, Clock, Palmtree, User, Settings, type LucideIcon } from 'lucide-react';
import type { AppNavTab } from './enabledModules';

/**
 * Icone della barra di navigazione principale: unica fonte di verità.
 * Usata da `TopTabBar` (barra reale) e dall'anteprima admin "Cosa vede chi",
 * così le icone dell'anteprima restano identiche a quelle dell'app.
 */
export const tabIcons: Record<AppNavTab, LucideIcon> = {
  home: LayoutDashboard,
  turni: CalendarDays,
  timesheet: Clock,
  ferie: Palmtree,
  profile: User,
  reports: Clock,
  settings: Settings,
};
