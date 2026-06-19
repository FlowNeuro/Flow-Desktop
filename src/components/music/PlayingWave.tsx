type PlayingWaveProps = {
  className?: string;
  barClassName?: string;
};

const heights = [10, 16, 12, 18];

export function PlayingWave({ className, barClassName }: PlayingWaveProps) {
  return (
    <span
      className={`flex h-5 w-5 items-end justify-center gap-0.5 ${className ?? ''}`}
      aria-hidden="true"
    >
      {heights.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={`music-wave-bar w-0.5 rounded-full bg-current ${barClassName ?? ''}`}
          style={{
            height,
            animationDelay: `${index * 95}ms`,
            animationDuration: `${720 + index * 45}ms`,
          }}
        />
      ))}
    </span>
  );
}

export default PlayingWave;
