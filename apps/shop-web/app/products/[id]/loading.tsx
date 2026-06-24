function LoadingBlock({
  className,
}: {
  className: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-[20px] bg-[var(--buyer-soft)] ${className}`}
    />
  );
}

export default function ProductDetailLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="detailGrid">
      <div className="gallery">
        <div className="overflow-hidden rounded-[22px] border border-[var(--buyer-border)] bg-white p-3 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
          <LoadingBlock className="aspect-square w-full rounded-[18px]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <LoadingBlock className="aspect-square w-full rounded-[16px]" />
          <LoadingBlock className="aspect-square w-full rounded-[16px]" />
          <LoadingBlock className="aspect-square w-full rounded-[16px]" />
        </div>
      </div>

      <div className="panel detailInfoPanel">
        <div className="flex flex-wrap gap-2">
          <LoadingBlock className="h-8 w-20 rounded-full" />
          <LoadingBlock className="h-8 w-24 rounded-full" />
          <LoadingBlock className="h-8 w-18 rounded-full" />
        </div>

        <div className="space-y-3">
          <LoadingBlock className="h-8 w-3/4" />
          <LoadingBlock className="h-5 w-1/3" />
          <LoadingBlock className="h-10 w-32" />
          <LoadingBlock className="h-4 w-full" />
          <LoadingBlock className="h-4 w-11/12" />
          <LoadingBlock className="h-4 w-4/5" />
        </div>

        <div className="grid gap-3">
          <LoadingBlock className="h-24 w-full" />
          <LoadingBlock className="h-24 w-full" />
        </div>

        <div className="space-y-3">
          <LoadingBlock className="h-12 w-full rounded-[16px]" />
          <LoadingBlock className="h-12 w-full rounded-[16px]" />
          <LoadingBlock className="h-12 w-full rounded-[16px]" />
        </div>
      </div>
    </section>
  );
}
