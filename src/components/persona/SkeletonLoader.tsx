export function SkeletonLoader() {
  return (
    <div className="flex flex-col gap-6 w-full animate-pane-in overflow-y-auto px-4 py-6 md:px-8">
      {/* Overview Skeleton */}
      <div className="h-44 w-full rounded-2xl bg-chrome-zinc-900/50 border border-chrome-zinc-800/60 animate-pulse flex flex-col justify-end p-6 gap-3">
        <div className="h-6 w-1/4 rounded bg-chrome-zinc-800" />
        <div className="h-4 w-2/3 rounded bg-chrome-zinc-800" />
        <div className="h-2 w-full rounded-full bg-chrome-zinc-800 mt-2" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-chrome-zinc-900/40 border border-chrome-zinc-800/50 animate-pulse p-4 flex flex-col justify-between">
            <div className="h-3.5 w-1/2 rounded bg-chrome-zinc-800" />
            <div className="h-6 w-1/3 rounded bg-chrome-zinc-800" />
          </div>
        ))}
      </div>

      {/* Two columns layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-96 rounded-2xl bg-chrome-zinc-900/40 border border-chrome-zinc-800/50 animate-pulse p-6">
          <div className="h-4 w-1/3 rounded bg-chrome-zinc-800 mb-6" />
          <div className="h-64 w-full rounded bg-chrome-zinc-800/40" />
        </div>
        <div className="h-96 rounded-2xl bg-chrome-zinc-900/40 border border-chrome-zinc-800/50 animate-pulse p-6">
          <div className="h-4 w-1/3 rounded bg-chrome-zinc-800 mb-6" />
          <div className="h-64 w-full rounded bg-chrome-zinc-800/40" />
        </div>
      </div>
    </div>
  );
}
