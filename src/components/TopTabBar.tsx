import { useRef } from 'react';
import { useT } from '../hooks/useT';
import type { AppNavTab } from '../utils/enabledModules';
import { LayoutDashboard, CalendarDays, Clock, Palmtree, User, Settings, type LucideIcon } from 'lucide-react';

interface TopTabBarProps {
  activeTab: AppNavTab;
  onTabChange: (tab: AppNavTab) => void;
  visibleTabs: AppNavTab[];
}

const tabIcons: Record<AppNavTab, LucideIcon> = {
  home: LayoutDashboard,
  turni: CalendarDays,
  timesheet: Clock,
  ferie: Palmtree,
  profile: User,
  reports: Clock,
  settings: Settings,
};

export default function TopTabBar({ activeTab, onTabChange, visibleTabs }: TopTabBarProps) {
  const t = useT();
  const tv = t as Record<string, string>;
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const tabLabels: Record<AppNavTab, string> = {
    home: tv.home_dashboard_title ?? 'Home',
    turni: tv.sidebar_shifts ?? 'Turni',
    timesheet: tv.timesheet_title ?? 'Presenze',
    ferie: tv.sidebar_holidays ?? 'Ferie',
    profile: tv.bottom_nav_profile ?? tv.sidebar_profile ?? 'Profilo',
    reports: tv.sidebar_statistics ?? 'Report',
    settings: tv.bottom_nav_settings_title ?? 'Impostazioni',
  };

  const visible = new Set(visibleTabs);

  const defs: { id: AppNavTab; label: string }[] = [
    { id: 'home', label: tabLabels.home },
    { id: 'turni', label: tabLabels.turni },
    { id: 'timesheet', label: tabLabels.timesheet },
    { id: 'ferie', label: tabLabels.ferie },
    { id: 'profile', label: tabLabels.profile },
    { id: 'settings', label: tabLabels.settings },
  ];

  const tabs = defs.filter((d) => visible.has(d.id));

  return (
    <nav
      data-tour="nav"
      className="top-tabbar flex items-center scrollbar-none"
      aria-label={t.nav_primary_tabs}
    >
      <div className="flex w-full">
        {tabs.map(({ id, label }) => {
          const isActive = activeTab === id;
          const Icon = tabIcons[id];
          return (
            <button
              key={id}
              ref={isActive ? activeRef : null}
              type="button"
              data-tour={id === 'profile' ? 'profile' : id === 'turni' ? 'shifts' : undefined}
              onClick={() => onTabChange(id)}
              title={label}
              aria-label={label}
              className={`top-tab whitespace-nowrap ${id === 'settings' ? 'hidden md:inline' : ''}`}
              style={{
                flex: '1 1 0',
                minWidth: 0,
                padding: '11px 4px',
                fontSize: 12,
                fontWeight: 500,
                textAlign: 'center' as const,
                textTransform: 'uppercase',
                color: isActive ? 'white' : 'rgba(255,255,255,0.45)',
                background: 'none',
                border: 'none',
                borderTop: isActive ? '1px solid white' : '1px solid transparent',
                borderRadius: 0,
                cursor: 'pointer',
                letterSpacing: '0.3px',
                outline: 'none',
                transition: 'color 0.15s, border-color 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Icon && <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
