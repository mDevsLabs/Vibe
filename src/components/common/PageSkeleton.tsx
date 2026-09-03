/**
 * Squelette de chargement de page — fallback Suspense du code splitting.
 */

export const PageSkeleton: React.FC = () => (
  <div className="animate-fadeIn p-4 sm:p-6 space-y-4" aria-busy="true" aria-label="Chargement">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex gap-3 animate-pulse">
        <div className="w-10 h-10 rounded-full bg-zinc-800/80 shrink-0" />
        <div className="flex-1 space-y-2.5">
          <div className="flex gap-2 items-center">
            <div className="h-3 w-24 rounded bg-zinc-800/80" />
            <div className="h-3 w-16 rounded bg-zinc-800/60" />
          </div>
          <div className="h-3 w-full rounded bg-zinc-800/70" />
          <div className="h-3 w-3/4 rounded bg-zinc-800/70" />
        </div>
      </div>
    ))}
  </div>
);

/** Squelette d'une carte de publication (état de chargement du fil). */
export const PostCardSkeleton: React.FC = () => (
  <div className="p-4 border-b border-zinc-800/90" aria-busy="true" aria-label="Chargement">
    <div className="flex gap-3 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-zinc-800/80 shrink-0" />
      <div className="flex-1 space-y-2.5">
        <div className="flex gap-2 items-center">
          <div className="h-3.5 w-28 rounded bg-zinc-800/80" />
          <div className="h-3.5 w-14 rounded bg-zinc-800/60" />
        </div>
        <div className="h-3 w-full rounded bg-zinc-800/70" />
        <div className="h-3 w-11/12 rounded bg-zinc-800/70" />
        <div className="h-3 w-2/3 rounded bg-zinc-800/50" />
        <div className="flex gap-8 pt-3">
          <div className="h-4 w-10 rounded bg-zinc-800/50" />
          <div className="h-4 w-10 rounded bg-zinc-800/50" />
          <div className="h-4 w-10 rounded bg-zinc-800/50" />
        </div>
      </div>
    </div>
  </div>
);
