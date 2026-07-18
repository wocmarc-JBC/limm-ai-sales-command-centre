export default function InboxLoading() {
  return (
    <div role="status" aria-label="Loading WhatsApp Inbox" data-testid="inbox-loading-state">
      <div className="flex h-12 items-center justify-between">
        <div className="skeleton-shimmer h-7 w-52 rounded-lg" />
        <div className="skeleton-shimmer h-9 w-24 rounded-lg" />
      </div>
      <section className="inbox-product-frame mt-3 flex flex-col overflow-hidden rounded-2xl border border-command-line bg-command-panel shadow-command">
        <div className="skeleton-shimmer h-11 border-b border-command-line" />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="border-r border-command-line bg-command-panel2 p-3">
            <div className="skeleton-shimmer h-10 rounded-xl" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3, 4].map((item) => <div key={item} className="skeleton-shimmer h-20 rounded-xl" />)}
            </div>
          </div>
          <div className="hidden min-h-0 flex-col lg:flex">
            <div className="skeleton-shimmer h-[4.25rem] border-b border-command-line" />
            <div className="flex-1 p-5">
              <div className="skeleton-shimmer ml-auto h-20 w-2/3 rounded-2xl" />
              <div className="skeleton-shimmer mt-4 h-20 w-1/2 rounded-2xl" />
            </div>
            <div className="border-t border-command-line p-4">
              <div className="skeleton-shimmer h-16 rounded-2xl" />
            </div>
          </div>
        </div>
      </section>
      <span className="sr-only">Loading conversations…</span>
    </div>
  );
}
