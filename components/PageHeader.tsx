export function PageHeader({
  title,
  eyebrow,
  children
}: {
  title: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-command-gold">{eyebrow}</p> : null}
        <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-[-0.02em] text-command-text md:text-[1.75rem]">{title}</h1>
      </div>
      {children ? <div className="thin-scrollbar flex max-w-full gap-2 overflow-x-auto pb-1 [&>*]:shrink-0">{children}</div> : null}
    </header>
  );
}
