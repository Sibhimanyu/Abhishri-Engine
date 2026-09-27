import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminUser, usePendingApprovals } from './poster/approval';
import { CenteredSpinner } from './Spinner';
import { ChefHat, NotebookPen } from 'lucide-react';

const WeeklyMenu = lazy(() => import('./WeeklyMenu'));
const DailyReport = lazy(() => import('./DailyReport'));

/**
 * The weekly menu and the daily report under one sidebar entry: both are posters staff
 * make for parents, with the same save / approve / export flow. ?tab=report opens the
 * report; the old /weekly-menu and /daily-report links redirect here.
 */
export default function MenuAndReport() {
  const { userData } = useAuth();
  const isAdmin = isAdminUser(userData);
  const pending = usePendingApprovals(isAdmin);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'report' ? 'report' : 'menu';

  const tabs = [
    { key: 'menu', label: 'Weekly Menu', icon: ChefHat, count: pending.menus },
    { key: 'report', label: 'Daily Report', icon: NotebookPen, count: pending.reports },
  ];

  return (
    <div className="space-y-6">
      <div role="tablist" className="inline-flex bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-brand-card-border/40">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'menu' ? {} : { tab: key }, { replace: true })}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${tab === key ? 'bg-brand-card text-brand-primary shadow-sm' : 'text-brand-text-dim hover:text-brand-text'}`}
          >
            <Icon size={16} /> {label}
            {count > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-black flex items-center justify-center" title={`${count} waiting for approval`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      <Suspense fallback={<CenteredSpinner />}>
        {tab === 'menu' ? <WeeklyMenu /> : <DailyReport />}
      </Suspense>
    </div>
  );
}
