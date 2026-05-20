import { useState } from 'react';
import { Chip } from '../ui/Chip';

export function CategoryChips() {
  const [active, setActive] = useState('All');
  const categories = [
    "All", "Music", "Gaming", "FlowNeuro Insights", "Live", "Podcasts", "News", "Coding", "Lo-fi"
  ];

  return (
    <div 
      className="sticky top-0 z-30 flex items-center gap-3 overflow-x-auto bg-background px-4 py-3 border-b border-zinc-800"
      style={{ scrollbarWidth: 'none' }}
    >
      <style>{`.hide-scroll::-webkit-scrollbar { display: none; }`}</style>
      <div className="flex gap-3 hide-scroll">
        {categories.map((cat) => (
          <Chip 
            key={cat} 
            active={active === cat} 
            onClick={() => setActive(cat)}
          >
            {cat}
          </Chip>
        ))}
      </div>
    </div>
  );
}
