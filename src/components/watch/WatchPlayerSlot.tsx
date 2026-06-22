import { PictureInPicture2 } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";

export function WatchPlayerSlot() {
  const isTheaterMode = usePlayerStore((s) => s.isTheaterMode);
  const isFloating = usePlayerStore((s) => s.videoPlayerMode === "pip");
  const expandVideoPlayer = usePlayerStore((s) => s.expandVideoPlayer);

  return (
    <div
      data-flow-watch-player-slot="true"
      className={
        isTheaterMode
          ? "relative w-full aspect-video max-h-[calc(100vh-160px)] min-h-[480px] bg-black"
          : "relative w-full aspect-video overflow-hidden rounded-xl bg-black"
      }
    >

      {isFloating && (
        <button
          type="button"
          onClick={expandVideoPlayer}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-black/85 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
        >
          <PictureInPicture2 className="h-7 w-7" />
          Playing in mini player — tap to expand
        </button>
      )}
    </div>
  );
}
