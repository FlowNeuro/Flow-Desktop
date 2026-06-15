import { MusicShelf } from './MusicShelf';

function TrackRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-2">
      <div className="h-4 w-4 shrink-0 rounded bg-surface-container-low" />
      <div className="h-12 w-12 shrink-0 rounded-md bg-surface-container-low" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="h-3.5 w-1/2 rounded bg-surface-container-low" />
        <div className="h-3 w-1/3 rounded bg-surface-container-low" />
      </div>
      <div className="h-3 w-10 shrink-0 rounded bg-surface-container-low" />
    </div>
  );
}

function VideoCardSkeleton() {
  return (
    <div className="flex w-[280px] shrink-0 flex-col gap-3">
      <div className="aspect-video w-full rounded-xl bg-surface-container-low" />
      <div className="h-3.5 w-3/4 rounded bg-surface-container-low" />
      <div className="h-3 w-1/2 rounded bg-surface-container-low" />
    </div>
  );
}

function SectionHeading() {
  return <div className="mb-3 h-6 w-40 rounded bg-surface-container-low" />;
}

export function ArtistSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Hero */}
      <div className="relative flex h-[40vh] min-h-[300px] w-full flex-col justify-end overflow-hidden rounded-b-3xl bg-surface-container-low p-8">
        <div className="h-12 w-2/3 max-w-xl rounded-lg bg-surface-container" />
        <div className="mt-4 h-4 w-48 rounded bg-surface-container" />
        <div className="mt-6 flex items-center gap-3">
          <div className="h-12 w-32 rounded-full bg-surface-container" />
          <div className="h-12 w-32 rounded-full bg-surface-container" />
          <div className="h-12 w-32 rounded-full bg-surface-container" />
        </div>
      </div>

      <div className="mx-auto flex max-w-[1600px] flex-col gap-10 p-8">
        {/* Top songs — two-column dense grid */}
        <section>
          <SectionHeading />
          <div className="grid gap-x-8 gap-y-2 lg:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <TrackRowSkeleton key={i} />
            ))}
          </div>
        </section>

        {/* Albums + Singles rails */}
        <MusicShelf title="" items={[]} loading skeletonShape="square" renderItem={() => null} />
        <MusicShelf title="" items={[]} loading skeletonShape="square" renderItem={() => null} />

        {/* Videos rail (16:9) */}
        <section>
          <SectionHeading />
          <div className="flex gap-6 overflow-hidden pb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </div>
        </section>

        {/* Related artists rail (circular) */}
        <MusicShelf title="" items={[]} loading skeletonShape="circle" renderItem={() => null} />

        {/* About card */}
        <section>
          <SectionHeading />
          <div className="flex flex-col gap-3 rounded-2xl bg-surface-container-low p-6">
            <div className="h-3.5 w-full rounded bg-surface-container" />
            <div className="h-3.5 w-11/12 rounded bg-surface-container" />
            <div className="h-3.5 w-10/12 rounded bg-surface-container" />
            <div className="h-3.5 w-2/3 rounded bg-surface-container" />
          </div>
        </section>
      </div>
    </div>
  );
}

export default ArtistSkeleton;
