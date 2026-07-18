export default function AppLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading page">
      <div className="skeleton-shimmer h-3 w-32 rounded-full" />
      <div className="skeleton-shimmer mt-3 h-9 w-72 max-w-full rounded-xl" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-2xl border border-command-line bg-command-panel p-4">
            <div className="skeleton-shimmer h-3 w-24 rounded-full" />
            <div className="skeleton-shimmer mt-4 h-9 w-16 rounded-lg" />
            <div className="skeleton-shimmer mt-4 h-3 w-full rounded-full" />
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-command-line bg-command-panel p-5">
        <div className="skeleton-shimmer h-4 w-40 rounded-full" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton-shimmer h-16 rounded-xl" />)}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
