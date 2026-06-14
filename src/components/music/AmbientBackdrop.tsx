export function AmbientBackdrop({ src }: { src?: string | null }) {
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
      <div className="absolute inset-0 bg-linear-to-b from-neutral-950/40 via-neutral-950/60 to-neutral-950" />
    </div>
  );
}
