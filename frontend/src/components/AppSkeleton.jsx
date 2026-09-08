
/** A single shimmering placeholder bar. */
export const SkeletonBar = ({ className = 'h-3 w-24' }) => (
  <div className={`rounded-md bg-black/[0.08] dark:bg-white/10 animate-pulse ${className}`} />
);

/** Placeholder for one KPI card on the dashboard. */
const SkeletonKpiCard = () => (
  <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm flex items-start justify-between">
    <div className="flex-1 space-y-3">
      <SkeletonBar className="h-3 w-2/5" />
      <SkeletonBar className="h-8 w-1/2" />
      <SkeletonBar className="h-3 w-3/4" />
    </div>
    <SkeletonBar className="h-12 w-12 rounded-xl shrink-0" />
  </div>
);

/**
 * Full app-shell skeleton (sidebar, top bar, dashboard cards). Shown while auth and
 * permissions resolve so returning users see the layout instantly instead of a blank
 * page. Matches the structure and widths in index.html's pre-React skeleton so the
 * handoff from static HTML to React is seamless.
 */
export default function AppSkeleton() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-brand-bg" aria-hidden="true" aria-busy="true">
      <aside className="w-[260px] bg-brand-sidebar border-r border-brand-card-border hidden md:flex flex-col">
        <div className="flex items-center justify-center p-6 border-b border-brand-card-border h-24">
          <img src="/logo-coral.png" alt="" className="h-16 w-auto object-contain block dark:hidden" />
          <img src="/logo-white.png" alt="" className="h-16 w-auto object-contain hidden dark:block" />
        </div>
        <div className="flex flex-col gap-3 p-4">
          {['w-[70%]', 'w-[55%]', 'w-[65%]', 'w-[50%]', 'w-[70%]', 'w-[55%]', 'w-[65%]', 'w-[50%]'].map((w, i) => (
            <SkeletonBar key={i} className={`h-3 ${w}`} />
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-brand-card border-b border-brand-card-border flex items-center justify-between gap-4 px-4 md:px-8">
          <SkeletonBar className="h-5 w-[45%] max-w-[220px]" />
          <SkeletonBar className="h-5 w-[30%] max-w-[140px]" />
        </header>

        <div className="flex-1 p-4 md:p-8 space-y-8 overflow-hidden">
          <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl shadow-sm space-y-3">
            <SkeletonBar className="h-3 w-40" />
            <SkeletonBar className="h-8 w-80 max-w-full" />
            <SkeletonBar className="h-3 w-3/5" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <SkeletonKpiCard />
            <SkeletonKpiCard />
            <SkeletonKpiCard />
            <SkeletonKpiCard />
          </div>
        </div>
      </main>
    </div>
  );
}
