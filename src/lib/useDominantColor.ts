import { useEffect, useState } from "react";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const cache = new Map<string, Rgb | null>();

function extract(img: HTMLImageElement): Rgb | null {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // tainted canvas (no CORS) — caller falls back
  }

  // Weight each pixel by saturation, ignoring near-black/white, for a vibrant pick.
  let wr = 0;
  let wg = 0;
  let wb = 0;
  let wsum = 0;
  let ar = 0;
  let ag = 0;
  let ab = 0;
  let acount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a < 200) continue;
    ar += r;
    ag += g;
    ab += b;
    acount++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luma < 0.15 || luma > 0.92 || sat < 0.15) continue;
    const w = sat * sat;
    wr += r * w;
    wg += g * w;
    wb += b * w;
    wsum += w;
  }
  if (wsum > 0) return { r: Math.round(wr / wsum), g: Math.round(wg / wsum), b: Math.round(wb / wsum) };
  if (acount > 0) return { r: Math.round(ar / acount), g: Math.round(ag / acount), b: Math.round(ab / acount) };
  return null;
}

/** Extracts a vibrant dominant color from artwork for immersive theming. */
export function useDominantColor(src: string | null | undefined): Rgb | null {
  const [color, setColor] = useState<Rgb | null>(() => (src ? cache.get(src) ?? null : null));

  useEffect(() => {
    if (!src) {
      setColor(null);
      return;
    }
    if (cache.has(src)) {
      setColor(cache.get(src) ?? null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = extract(img);
      cache.set(src, c);
      if (!cancelled) setColor(c);
    };
    img.onerror = () => {
      cache.set(src, null);
      if (!cancelled) setColor(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return color;
}
