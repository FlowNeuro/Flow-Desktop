import { usePlayerStore } from "../../store/usePlayerStore";
import type { WatchLayoutProps } from "./types";

export function WatchLayout({ player, metadata, description, comments, sidebar }: WatchLayoutProps) {
  const isTheaterMode = usePlayerStore((s) => s.isTheaterMode);

  return (
    <div className="min-h-screen bg-background pb-32 text-white">
      <div
        className={`mx-auto grid w-full grid-cols-1 items-start gap-x-6 gap-y-5 transition-[max-width,padding] duration-300 ease-out ${
          isTheaterMode
            ? "max-w-full px-0 pt-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1100px)_400px_minmax(0,1fr)]"
            : "max-w-[1800px] px-4 pt-4 md:px-6 md:pt-6 lg:grid-cols-[1fr_400px]"
        }`}
      >

        <div
          className={`z-10 w-full ${
            isTheaterMode ? "bg-black lg:col-span-full lg:row-start-1" : "lg:col-start-1 lg:row-start-1"
          }`}
        >
          {player}
        </div>

        {/* MAIN — title / actions / description / comments. */}
        <div
          className={`flex w-full min-w-0 flex-col gap-5 lg:row-start-2 ${
            isTheaterMode ? "lg:col-start-2" : "lg:col-start-1"
          }`}
        >
          {metadata}
          {description}
          {comments}
        </div>

        {/* SIDEBAR — chapters / related. Sticky beside the player in Default mode. */}
        <div
          className={`flex w-full flex-col gap-5 ${
            isTheaterMode
              ? "lg:col-start-3 lg:row-start-2"
              : "lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-6 lg:self-start"
          }`}
        >
          {sidebar}
        </div>
      </div>
    </div>
  );
}
