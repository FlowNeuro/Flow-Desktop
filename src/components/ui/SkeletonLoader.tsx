export interface SkeletonLoaderProps {
  type?: 'avatar' | 'thumbnail' | 'text' | 'title';
  className?: string;
}

export function SkeletonLoader({ type = 'text', className = '' }: SkeletonLoaderProps) {
  const baseStyles = 'animate-pulse bg-chrome-zinc-800';
  
  const types = {
    avatar: 'rounded-full h-9 w-9',
    thumbnail: 'rounded-xl aspect-video w-full',
    text: 'rounded-sm h-3 w-full',
    title: 'rounded-sm h-4 w-3/4',
  };

  return (
    <div className={`${baseStyles} ${types[type]} ${className}`} />
  );
}
