function Block({ className }: { className?: string }) {
  return <div className={`rounded-[6px] bg-[var(--creed-surface-raised)] ${className ?? ""}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="h-full overflow-hidden bg-[var(--creed-surface)]" aria-hidden="true">
      <div className="mx-auto max-w-5xl px-5 py-7 md:px-10 md:py-10 xl:px-14">
        <div className="animate-pulse">
          <div className="border-b border-[var(--creed-border)] pb-7">
            <Block className="h-8 w-40" />
            <Block className="mt-3 h-4 w-80 max-w-full" />
          </div>
          <div className="mt-8 divide-y divide-[var(--creed-border)] border-y border-[var(--creed-border)]">
            {[0, 1, 2].map((item) => (
              <div key={item} className="py-5 md:px-3">
                <div className="flex items-center gap-3">
                  <Block className="h-8 w-8 rounded-[8px]" />
                  <div className="min-w-0 flex-1">
                    <Block className="h-4 w-48 max-w-full" />
                    <Block className="mt-2 h-3 w-24" />
                  </div>
                </div>
                <Block className="mt-4 h-3.5 w-[70%]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
