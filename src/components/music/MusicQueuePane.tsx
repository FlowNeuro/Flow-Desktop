import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { useMusicHiddenFilter } from "../../store/useMusicActionsStore";
import { getString } from "../../lib/i18n/index";
import { MusicItemCard } from "./MusicItemCard";

export function MusicQueuePane() {
  const queue = useMusicPlayerStore((s) => s.queue);
  const currentIndex = useMusicPlayerStore((s) => s.currentIndex);
  const loadIndex = useMusicPlayerStore((s) => s._loadIndex);
  const isHidden = useMusicHiddenFilter();

  const visible = queue
    .map((track, i) => ({ track, i }))
    .filter(({ track, i }) => i === currentIndex || !isHidden(track));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          {getString("music_queue")}
        </h3>
        <span className="font-mono text-xs tabular-nums text-neutral-500">{visible.length}</span>
      </div>

      <div className="hide-scrollbar -mr-1 flex-1 overflow-y-auto pr-1">
        {visible.map(({ track, i }) => (
          <MusicItemCard
            key={`${track.videoId ?? track.id}-${i}`}
            variant="track-list"
            item={track}
            className={i === currentIndex ? "bg-surface-container" : ""}
            onPlay={() => void loadIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
