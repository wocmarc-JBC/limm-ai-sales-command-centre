import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-command-line bg-command-panel p-7 text-center shadow-premium">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-command-gold">Page not found</p>
      <h1 className="mt-2 text-3xl font-semibold text-command-text">This Command Centre route does not exist.</h1>
      <p className="mt-3 text-sm leading-6 text-command-muted">Return to today’s brief or open the WhatsApp Inbox.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-sm font-semibold text-black hover:bg-command-goldHover">Today</Link>
        <Link href="/inbox" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-sm font-semibold text-command-text hover:border-command-gold/50">WhatsApp Inbox</Link>
      </div>
    </section>
  );
}
