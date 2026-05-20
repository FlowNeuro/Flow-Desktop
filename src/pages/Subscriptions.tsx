import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Search as SearchIcon, Upload, Loader2 } from "lucide-react";
import { parseSubscriptionExport } from "../lib/api/youtube";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { getString } from "../lib/i18n/index";

interface SubscriptionsProps {
  onPlay: (video: any) => void;
  onAddToQueue: (video: any) => void;
}

export const Subscriptions: React.FC<SubscriptionsProps> = () => {
  const navigate = useNavigate();
  const { subscriptions, loadSubscriptions, loading, unsubscribe, subscribe } = useSubscriptionStore();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Import section state
  const [importText, setImportText] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const handleSubscribeToggle = async (channelId: string, channelName: string) => {
    const cleanId = channelId.replace("channel:", "");
    if (subscriptions.some((c) => c.id === cleanId)) {
      await unsubscribe(cleanId);
    } else {
      await subscribe(cleanId, channelName);
    }
  };

  // Import Takeout CSV or RSS OPML outline
  const handleImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    try {
      const parsed = await parseSubscriptionExport(importText);
      if (parsed.length > 0) {
        for (const [id, name] of parsed) {
          await subscribe(id, name);
        }
        setImportText("");
        setShowImportModal(false);
      } else {
        alert("No valid subscription records could be parsed. Check the format.");
      }
    } catch (e) {
      console.error("Import failed", e);
    } finally {
      setIsImporting(false);
    }
  };

  const filteredChannels = subscriptions.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-grow overflow-y-auto px-8 py-6 space-y-6">
      {/* Master Subscriptions manager layout */}
      <div className="space-y-6 pb-20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
              {getString("top_bar_subscriptions_title")}
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Keep up with your favorite creators, importing lists in a snap
            </p>
          </div>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white py-2.5 px-4 rounded-xl text-xs font-semibold shadow-lg shadow-red-600/10 transition-all active:scale-95 shrink-0"
          >
            <Upload size={14} />
            Import Subscriptions
          </button>
        </div>

        {/* Search bar filter */}
        <div className="relative max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={getString("subscriptions_search_placeholder")}
            className="w-full bg-zinc-900/50 border border-zinc-800 focus:border-red-500/50 px-4 py-3 pl-11 rounded-2xl text-xs font-medium text-zinc-100 placeholder-zinc-500 outline-none transition-all"
          />
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={15} />
        </div>

        {/* Subscribed channels listing */}
        {loading && subscriptions.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-red-500" size={32} />
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-800 rounded-3xl p-8 bg-zinc-900/10">
            <User className="text-zinc-700 mb-4" size={48} />
            <h3 className="font-bold text-zinc-300">{getString("no_subscriptions_yet")}</h3>
            <p className="text-zinc-500 text-xs mt-1 max-w-sm">
              {getString("empty_subscriptions_body")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
            {filteredChannels.map((channel) => (
              <div
                key={channel.id}
                onClick={() => navigate(`/channel/${channel.id}`)}
                className="flex flex-col items-center p-5 bg-zinc-900/30 hover:bg-zinc-900/60 border border-zinc-800/40 hover:border-zinc-700/60 rounded-2xl cursor-pointer transition-all duration-300 group"
              >
                <div className="w-16 h-16 rounded-full overflow-hidden bg-zinc-800 mb-3 border border-zinc-700 group-hover:border-red-500/50 transition-colors">
                  {channel.avatarUrl ? (
                    <img
                      src={channel.avatarUrl}
                      alt={channel.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-bold text-zinc-400">
                      {channel.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <h4 className="font-bold text-xs text-zinc-200 line-clamp-1 group-hover:text-red-400 transition-colors">
                  {channel.name}
                </h4>
                <div className="flex items-center justify-between w-full mt-3 pt-2 border-t border-zinc-800/40">
                  <span className="text-[10px] text-zinc-550 font-semibold group-hover:text-zinc-300">View Channel</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSubscribeToggle(channel.id, channel.name);
                    }}
                    className="text-[10px] text-red-400 hover:text-red-300 font-bold"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import OPML / CSV Dialog Overlay */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 max-w-lg w-full rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Upload size={18} className="text-red-500" />
                Import Subscriptions list
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-xs font-semibold py-1"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Paste RSS OPML outlines, Google Takeout CSV outlines, or raw lists of YouTube channel URLs. We will parse and subscribe to them instantly.
            </p>

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`<!-- OPML Outline template -->\n<outline xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UC..." title="Fireship"/>\n\n<!-- Or Takeout CSV line -->\nUCsBjURrdU234nU351gVEfTA,,Fireship`}
              rows={8}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500/50 p-4 rounded-2xl text-xs font-mono text-zinc-300 outline-none resize-none"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 border border-zinc-800 hover:bg-zinc-800 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting || !importText.trim()}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-red-600/10 active:scale-95"
              >
                {isImporting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Upload size={13} />
                    Parse & Import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
