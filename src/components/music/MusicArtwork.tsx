import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Music2, Loader2 } from "lucide-react";
import { upgradeMusicImageUrl } from "../../lib/thumbnails";
import { useProxiedImageUrl } from "../../lib/useProxiedImageUrl";

interface MusicArtworkProps {
  src?: string | null;
  alt: string;
  className?: string;

  layoutId?: string;
  loading?: boolean;
  iconClassName?: string;
}

export function MusicArtwork({
  src,
  alt,
  className,
  layoutId,
  loading = false,
  iconClassName = "h-5 w-5",
}: MusicArtworkProps) {
  const [failed, setFailed] = useState(false);
  const imageSrc = useProxiedImageUrl(upgradeMusicImageUrl(src));
  const showImage = !!imageSrc && !failed;
  useEffect(() => setFailed(false), [imageSrc]);

  return (
    <motion.div
      layoutId={layoutId}
      className={`relative overflow-hidden bg-surface-container-highest ${className ?? ""}`}
    >
      {showImage ? (
        <img
          src={imageSrc}
          alt={alt}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-neutral-500" aria-hidden>
          <Music2 className={iconClassName} />
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-black/40">
          <Loader2 className={`${iconClassName} animate-spin text-neutral-100`} />
        </div>
      )}
    </motion.div>
  );
}
