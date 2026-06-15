import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

import type { LyricsEntry, WordTimestamp } from "../../lib/lyrics/types";
import type { Rgb } from "../../lib/useDominantColor";
import { findCurrentLineIndex } from "../../lib/lyrics/lyricsUtils";
import { musicAudioEngine } from "../../lib/audio/musicAudioEngine";
import { getString } from "../../lib/i18n/index";

const ANCHOR_RATIO = 0.42;
const LINE_SPACING = 1.26;
const LINE_GAP = 16;
const GAP_BLOCK_H = 88;
const BASE_FONT_PX = 40;
const FOCUSED_ALPHA = 0.45;
const PREVIEW_RESYNC_MS = 8000;

const rgba = (c: Rgb, a: number) => `rgba(${c.r},${c.g},${c.b},${a})`;

interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}
let segmenter: GraphemeSegmenter | null = null;
function graphemes(str: string): string[] {
  const intl = Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => GraphemeSegmenter };
  if (intl.Segmenter) {
    if (!segmenter) segmenter = new intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(str), (s) => s.segment);
  }
  return Array.from(str);
}

function adaptiveFontPx(textLength: number, isBackground: boolean): number {
  const size =
    textLength > 92 ? BASE_FONT_PX * 0.66
    : textLength > 72 ? BASE_FONT_PX * 0.72
    : textLength > 54 ? BASE_FONT_PX * 0.8
    : textLength > 42 ? BASE_FONT_PX * 0.9
    : BASE_FONT_PX;
  return isBackground ? size * 0.7 : size;
}

interface Cluster {
  ch: string;
  x: number;
  w: number;
  word: number;
  charInWord: number;
  wordLen: number;
}
interface Row {
  clusters: Cluster[];
  width: number;
  text: string;
}
type Item =
  | {
      kind: "line";
      lineIndex: number;
      rows: Row[];
      blockHeight: number;
      fontPx: number;
      font: string;
      isBackground: boolean;
      words: WordTimestamp[] | null;
      empty: boolean;
    }
  | { kind: "gap"; blockHeight: number; start: number; end: number };
interface Layout {
  items: Item[];
  tops: number[];
  lineToItem: number[];
}

const displayText = (entry: LyricsEntry): string =>
  entry.isBackground ? entry.text.replace(/^\(/, "").replace(/\)$/, "") : entry.text;

const fontFor = (fontPx: number, isBg: boolean): string =>
  `${isBg ? "italic " : ""}800 ${fontPx}px Inter, system-ui, sans-serif`;

function measure(ctx: CanvasRenderingContext2D, lines: LyricsEntry[], maxWidth: number): Layout {
  const items: Item[] = [];
  const tops: number[] = [];
  const lineToItem: number[] = [];
  let y = 0;

  const push = (item: Item, h: number) => {
    tops.push(y);
    items.push(item);
    y += h + LINE_GAP;
  };

  lines.forEach((entry, lineIndex) => {
    const text = displayText(entry);
    const isBg = !!entry.isBackground;
    const fontPx = adaptiveFontPx(text.length, isBg);
    const font = fontFor(fontPx, isBg);
    lineToItem[lineIndex] = items.length;

    if (text.trim().length === 0) {
      push({ kind: "line", lineIndex, rows: [], blockHeight: 6, fontPx, font, isBackground: isBg, words: null, empty: true }, 6);
    } else {
      ctx.font = font;
      const spaceW = ctx.measureText(" ").width;
      const words = entry.words && entry.words.length > 0 ? entry.words : null;
      const tokens = words ? words.map((w) => w.text) : text.split(/\s+/).filter(Boolean);

      const rows: Row[] = [];
      let cur: Cluster[] = [];
      let curW = 0;
      tokens.forEach((tok, wi) => {
        const g = graphemes(tok);
        const gc: Cluster[] = g.map((ch, ci) => ({
          ch,
          x: 0,
          w: ctx.measureText(ch).width,
          word: words ? wi : -1,
          charInWord: ci,
          wordLen: g.length,
        }));
        const wordW = gc.reduce((s, c) => s + c.w, 0);
        if (cur.length > 0 && curW + spaceW + wordW > maxWidth) {
          rows.push({ clusters: cur, width: curW, text: cur.map((c) => c.ch).join("") });
          cur = [];
          curW = 0;
        }
        if (cur.length > 0) {
          cur.push({ ch: " ", x: curW, w: spaceW, word: -1, charInWord: 0, wordLen: 1 });
          curW += spaceW;
        }
        gc.forEach((c) => {
          c.x = curW;
          curW += c.w;
          cur.push(c);
        });
      });
      if (cur.length > 0) rows.push({ clusters: cur, width: curW, text: cur.map((c) => c.ch).join("") });
      const blockHeight = Math.max(1, rows.length) * fontPx * LINE_SPACING;
      push({ kind: "line", lineIndex, rows, blockHeight, fontPx, font, isBackground: isBg, words, empty: false }, blockHeight);
    }

    // Instrumental gap → a breathing slot with a converging indicator.
    const next = lines[lineIndex + 1];
    if (next) {
      const curEnd = entry.words?.length
        ? entry.words[entry.words.length - 1]!.endTime
        : text.trim() === ""
          ? entry.time
          : null;
      if (curEnd != null && next.time - curEnd > 4000) {
        push({ kind: "gap", blockHeight: GAP_BLOCK_H, start: curEnd, end: next.time }, GAP_BLOCK_H);
      }
    }
  });

  return { items, tops, lineToItem };
}

export function LyricsCanvas({
  lines,
  accent,
  onSeek,
  className = "",
}: {
  lines: LyricsEntry[];
  accent: Rgb;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const offsetRef = useRef(0);
  const initializedRef = useRef(false);
  const modeRef = useRef<"auto" | "manual">("auto");
  const resyncTimer = useRef<number | null>(null);
  const animRef = useRef<Map<number, { scale: number; alpha: number; blur: number }>>(new Map());
  const [manual, setManual] = useState(false);

  const relayout = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizeRef.current = { w: cssW, h: cssH };
    layoutRef.current = measure(ctx, lines, cssW * 0.84);
    animRef.current.clear();
    initializedRef.current = false;
  };

  useEffect(() => {
    relayout();
    const ro = new ResizeObserver(() => relayout());
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(() => relayout());
    }
    return () => ro.disconnect();
  }, [lines]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [accent, lines]);

  useEffect(
    () => () => {
      if (resyncTimer.current) window.clearTimeout(resyncTimer.current);
    },
    [],
  );

  function draw() {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w: cssW, h: cssH } = sizeRef.current;
    const pos = musicAudioEngine.getCurrentTime() * 1000;
    const anchorY = cssH * ANCHOR_RATIO;
    const active = Math.max(0, findCurrentLineIndex(lines, pos));
    const activeItem = layout.lineToItem[active] ?? 0;
    const activeTop = layout.tops[activeItem] ?? 0;
    const activeBlock = layout.items[activeItem]?.blockHeight ?? 0;

    const target = activeTop + activeBlock / 2 - anchorY;
    if (modeRef.current === "auto") {
      if (!initializedRef.current) {
        offsetRef.current = target;
        initializedRef.current = true;
      } else {
        offsetRef.current += (target - offsetRef.current) * 0.16;
      }
    }
    const offset = offsetRef.current;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.textBaseline = "middle";
    const now = Date.now();
    const isManual = modeRef.current === "manual";

    layout.items.forEach((item, idx) => {
      const top = layout.tops[idx]! - offset;
      if (top + item.blockHeight < -60 || top > cssH + 60) return;

      if (item.kind === "gap") {
        if (!isManual) drawGap(ctx, item, cssW, top, pos);
        return;
      }
      if (item.empty) return;

      const dist = Math.abs(item.lineIndex - active);
      // While manually scrolling: everything readable (no blur, no emphasis).
      const isActive = !isManual && item.lineIndex === active;
      const tScale = isManual ? 0.96 : isActive ? 1.05 : 0.92;
      const tBlur = isManual || isActive || item.isBackground ? 0 : Math.min(dist * 4, 16);
      const tAlpha = isManual ? 0.85 : isActive ? 1 : dist === 1 ? 0.5 : dist === 2 ? 0.42 : dist === 3 ? 0.34 : 0.25;

      // Ease toward the targets (≈500ms feel) so scale/blur/alpha never snap.
      let a = animRef.current.get(item.lineIndex);
      if (!a) {
        a = { scale: tScale, alpha: tAlpha, blur: tBlur };
        animRef.current.set(item.lineIndex, a);
      } else {
        a.scale += (tScale - a.scale) * 0.16;
        a.alpha += (tAlpha - a.alpha) * 0.16;
        a.blur += (tBlur - a.blur) * 0.16;
      }

      const rowH = item.fontPx * LINE_SPACING;
      const centerYBlock = top + item.blockHeight / 2;

      ctx.save();
      ctx.filter = a.blur > 0.35 ? `blur(${a.blur.toFixed(2)}px)` : "none";
      ctx.globalAlpha = a.alpha;
      ctx.translate(cssW / 2, centerYBlock);
      ctx.scale(a.scale, a.scale);
      ctx.translate(-cssW / 2, -centerYBlock);
      ctx.font = item.font;

      item.rows.forEach((row, ri) => {
        const rowCenterY = top + ri * rowH + rowH / 2;
        if (isActive && item.words) {
          drawActiveRow(ctx, row, item.words, item.fontPx, cssW, rowCenterY, pos, now);
        } else {
          ctx.textAlign = "center";
          ctx.fillStyle = rgba(accent, 1);
          ctx.fillText(row.text, cssW / 2, rowCenterY);
        }
      });
      ctx.globalAlpha = 1;
      ctx.restore();
    });
  }

  function drawGap(ctx: CanvasRenderingContext2D, item: Extract<Item, { kind: "gap" }>, cssW: number, top: number, pos: number) {
    const visible = pos >= item.start && pos <= item.end - 650;
    if (!visible) return;
    const progress = item.end > item.start ? Math.min(1, Math.max(0, (pos - item.start) / (item.end - item.start))) : 0;
    const cy = top + item.blockHeight / 2;
    const trackW = Math.min(360, cssW * 0.4);
    const left = cssW / 2 - trackW / 2;

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "700 13px Inter, system-ui, sans-serif";
    ctx.fillStyle = rgba(accent, 0.85 * (1 - progress));
    ctx.fillText("I N S T R U M E N T A L", cssW / 2, cy - 22);

    // Dim track.
    ctx.fillStyle = rgba(accent, 0.15);
    roundRect(ctx, left, cy - 2, trackW, 4, 2);
    ctx.fill();
    // Converging bright segment + end dots.
    const segHalf = (trackW / 2) * (1 - progress);
    ctx.fillStyle = rgba(accent, 0.95);
    roundRect(ctx, cssW / 2 - segHalf, cy - 2, segHalf * 2, 4, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cssW / 2 - segHalf, cy, 4, 0, Math.PI * 2);
    ctx.arc(cssW / 2 + segHalf, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawActiveRow(
    ctx: CanvasRenderingContext2D,
    row: Row,
    words: WordTimestamp[],
    fontPx: number,
    cssW: number,
    rowCenterY: number,
    pos: number,
    now: number,
  ) {
    const rowOffsetX = cssW / 2 - row.width / 2;
    ctx.textAlign = "left";

    const shimmer = (now % 3000) / 3000;
    const span = Math.max(1, row.width);
    const gx = rowOffsetX + span * shimmer;
    const liquid = ctx.createLinearGradient(gx - span / 2, 0, gx + span / 2, 0);
    liquid.addColorStop(0, rgba(accent, 1));
    liquid.addColorStop(0.5, "rgba(255,255,255,0.85)");
    liquid.addColorStop(1, rgba(accent, 1));

    for (const c of row.clusters) {
      if (c.word < 0) continue;
      const w = words[c.word];
      if (!w) continue;
      const x = rowOffsetX + c.x;
      const dur = Math.max(100, w.endTime - w.startTime);
      const sung = pos > w.endTime;
      const sungFactor = sung ? 1 : pos >= w.startTime ? Math.min(1, (pos - w.startTime) / dur) : 0;
      const charLp = Math.min(
        1,
        Math.max(0, ((pos - w.startTime) / dur - c.charInWord / c.wordLen) * c.wordLen),
      );
      const since = pos - w.startTime;
      const sx = since >= 0 && since < 170 ? 1 + 0.05 * Math.sin((since / 170) * Math.PI) : 1;

      ctx.save();
      ctx.translate(x + c.w / 2, rowCenterY);
      ctx.scale(sx, sx);
      ctx.translate(-(x + c.w / 2), -rowCenterY);

      if (sung || charLp >= 0.999) {
        ctx.fillStyle = liquid;
        ctx.fillText(c.ch, x, rowCenterY);
      } else {
        ctx.fillStyle = rgba(accent, FOCUSED_ALPHA + (1 - FOCUSED_ALPHA) * sungFactor);
        ctx.fillText(c.ch, x, rowCenterY);
        if (charLp > 0) {
          const fillX = c.w * charLp;
          const edge = Math.max(1, c.w * 0.45);
          const solid = Math.max(0, fillX - edge);
          const clipTop = rowCenterY - fontPx * 0.75;
          const clipH = fontPx * 1.5;
          if (solid > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, clipTop, solid, clipH);
            ctx.clip();
            ctx.shadowColor = rgba(accent, 0.4);
            ctx.shadowBlur = fontPx * 0.3;
            ctx.fillStyle = liquid;
            ctx.fillText(c.ch, x, rowCenterY);
            ctx.restore();
          }
          for (let j = 0; j < 12; j++) {
            const s = solid + (j * edge) / 12;
            const e = Math.min(fillX, solid + ((j + 1) * edge) / 12);
            if (e <= s) continue;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + s, clipTop, e - s, clipH);
            ctx.clip();
            ctx.fillStyle = rgba(accent, 1 - (j + 0.5) / 12);
            ctx.fillText(c.ch, x, rowCenterY);
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }
  }

  const scheduleResync = () => {
    if (resyncTimer.current) window.clearTimeout(resyncTimer.current);
    resyncTimer.current = window.setTimeout(() => {
      modeRef.current = "auto";
      setManual(false);
    }, PREVIEW_RESYNC_MS);
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const { h } = sizeRef.current;
    const anchorY = h * ANCHOR_RATIO;
    const lastIdx = layout.items.length - 1;
    const contentBottom = (layout.tops[lastIdx] ?? 0) + (layout.items[lastIdx]?.blockHeight ?? 0);
    // offset = top_i - anchorY puts line i at the anchor; allow first→last + slack.
    const min = -anchorY - 120;
    const max = contentBottom - anchorY + 120;
    offsetRef.current = Math.max(min, Math.min(max, offsetRef.current + e.deltaY));
    modeRef.current = "manual";
    setManual(true);
    scheduleResync();
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const layout = layoutRef.current;
    const wrap = wrapRef.current;
    if (!layout || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const contentY = e.clientY - rect.top + offsetRef.current;
    for (let i = 0; i < layout.items.length; i++) {
      const item = layout.items[i]!;
      if (item.kind !== "line" || item.empty) continue;
      const top = layout.tops[i]!;
      if (contentY >= top && contentY <= top + item.blockHeight) {
        onSeek(Math.max(0, lines[item.lineIndex]!.time / 1000));
        modeRef.current = "auto";
        setManual(false);
        return;
      }
    }
  };

  const resyncNow = () => {
    if (resyncTimer.current) window.clearTimeout(resyncTimer.current);
    modeRef.current = "auto";
    setManual(false);
  };

  const fadeMask = "linear-gradient(to bottom, transparent 0%, #000 15%, #000 80%, transparent 100%)";
  return (
    <div ref={wrapRef} onWheel={onWheel} onClick={onClick} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}
      />
      <AnimatePresence>
        {manual && (
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              resyncNow();
            }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute left-1/2 top-24 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium"
            style={{ color: rgba(accent, 1) }}
          >
            <RefreshCw className="h-4 w-4" />
            {getString("music_resync")}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
