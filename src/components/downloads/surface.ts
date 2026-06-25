import type { Transition } from "framer-motion";

export function downloadSurfaceLayoutId(id: string): string {
  return `download-surface-${id}`;
}

/** Snappy, non-bouncy spring for the dock <-> dialog morph. */
export const DOWNLOAD_SURFACE_SPRING: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.8,
};
