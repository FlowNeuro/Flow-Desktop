import { useNavigate } from "react-router-dom";
import { Sparkles, Search } from "lucide-react";

interface DiscoveryQueriesProps {
  queries: string[];
}

export function DiscoveryQueries({ queries }: DiscoveryQueriesProps) {
  const navigate = useNavigate();

  const handleQueryClick = (query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  if (!queries || queries.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-zinc-950/60 border border-zinc-800/80 p-6 md:p-8 shadow-xl">
      {/* Background glow */}
      <div className="absolute top-0 left-0 w-60 h-60 bg-red-600/5 rounded-full blur-[80px] -ml-20 -mt-20 pointer-events-none" />

      <div className="flex items-center gap-2.5 mb-6">
        <div className="p-2 rounded-xl bg-red-950/30 border border-red-900/30 text-primary">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Discovery Horizon</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Neural prompts curated based on your taste profile to expand your media discovery.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {queries.map((query, index) => (
          <button
            key={index}
            onClick={() => handleQueryClick(query)}
            className="group flex items-center gap-2 px-4 py-3 bg-zinc-900/30 hover:bg-red-950/20 border border-zinc-850 hover:border-primary/40 rounded-2xl text-sm font-semibold text-zinc-300 hover:text-white cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-lg hover:shadow-red-950/10 active:scale-95"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <Search className="h-3.5 w-3.5 text-zinc-500 group-hover:text-primary transition-colors duration-300" />
            <span className="capitalize">{query}</span>
            <span className="text-[10px] text-zinc-600 group-hover:text-primary/70 font-mono pl-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
              ➜
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
