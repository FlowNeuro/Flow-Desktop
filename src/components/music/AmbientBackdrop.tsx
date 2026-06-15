import type { Rgb } from "../../lib/useDominantColor";

export function AmbientBackdrop({ src, accent }: { src?: string | null; accent?: Rgb | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-neutral-950">
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-[100px] saturate-150"
        />
      )}
      {accent && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 80% at 50% 0%, rgba(${accent.r},${accent.g},${accent.b},0.22), transparent 60%)`,
          }}
        />
      )}
      <div className="absolute inset-0 bg-linear-to-b from-neutral-950/40 via-neutral-950/60 to-neutral-950" />
    </div>
  );
}
