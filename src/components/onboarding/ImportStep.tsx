import React, { useState, useRef } from "react";
import { parseSubscriptionExport } from "../../lib/api/youtube";
import { useSubscriptionStore } from "../../store/useSubscriptionStore";

interface ParseChannelResult {
  id: string;
  name: string;
}

function parseJsonBackup(jsonText: string): ParseChannelResult[] {
  try {
    const data = JSON.parse(jsonText);
    const channels: ParseChannelResult[] = [];

    // Helper to extract channel ID from a YouTube URL
    const extractChannelIdFromUrl = (url: string): string => {
      if (!url) return "";
      let id = "";
      if (url.includes("/channel/")) {
        id = url.split("/channel/")[1];
      } else if (url.includes("/@")) {
        id = url.split("/@")[1];
      } else if (url.includes("/user/")) {
        id = url.split("/user/")[1];
      } else {
        id = url;
      }
      // Clean query parameters and trailing slashes
      id = id.split("/")[0].split("?")[0].trim();
      return id;
    };

    // 1. Check if it's an array of subscriptions directly or has a "subscriptions" key
    let rawSubs: any[] = [];
    if (Array.isArray(data)) {
      rawSubs = data;
    } else if (data && typeof data === "object") {
      if (Array.isArray(data.subscriptions)) {
        rawSubs = data.subscriptions;
      }
    }

    if (rawSubs.length > 0) {
      for (const item of rawSubs) {
        if (!item || typeof item !== "object") continue;

        // Flow Mobile format: { channelId, channelName }
        if (item.channelId && item.channelName) {
          channels.push({
            id: item.channelId.trim(),
            name: item.channelName.trim(),
          });
        }
        // LibreTube format: { channelId, name }
        else if (item.channelId && item.name) {
          channels.push({
            id: item.channelId.trim(),
            name: item.name.trim(),
          });
        }
        // NewPipe format: { url, name }
        else if (item.url && item.name) {
          const id = extractChannelIdFromUrl(item.url);
          if (id) {
            channels.push({
              id,
              name: item.name.trim(),
            });
          }
        }
      }
    }

    // 2. Fallback: Recursive deep search for objects that look like subscription entries
    // in case the structure is nested differently (e.g. settings/profiles)
    if (channels.length === 0 && data && typeof data === "object") {
      const visited = new Set<any>();
      const search = (obj: any) => {
        if (!obj || typeof obj !== "object" || visited.has(obj)) return;
        visited.add(obj);

        if (Array.isArray(obj)) {
          for (const val of obj) search(val);
        } else {
          // Check if this object looks like a subscription
          const channelId = obj.channelId || obj.id;
          const channelName = obj.channelName || obj.name || obj.title;
          
          if (
            typeof channelId === "string" && 
            channelId.startsWith("UC") && channelId.length >= 20 &&
            typeof channelName === "string" &&
            channelName.length > 0
          ) {
            channels.push({
              id: channelId.trim(),
              name: channelName.trim(),
            });
          } else {
            for (const key in obj) {
              if (Object.prototype.hasOwnProperty.call(obj, key)) {
                search(obj[key]);
              }
            }
          }
        }
      };
      search(data);
    }

    // De-duplicate by channel ID
    const seen = new Set<string>();
    return channels.filter((ch) => {
      if (seen.has(ch.id)) return false;
      seen.add(ch.id);
      return true;
    });
  } catch (e) {
    console.error("Failed to parse JSON backup", e);
    return [];
  }
}

export const ImportStep: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<"idle" | "reading" | "parsing" | "subscribing" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const { subscribe } = useSubscriptionStore();

  const handleCardClick = () => {
    if (importState === "reading" || importState === "parsing" || importState === "subscribing") return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportState("reading");
    setProgress(10);
    setErrorMessage("");

    const reader = new FileReader();
    
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 30);
        setProgress(10 + percent); // read stage represents up to 40% of progress
      }
    };

    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setImportState("error");
        setErrorMessage("The chosen file is empty or unreadable.");
        return;
      }

      setImportState("parsing");
      setProgress(50);

      try {
        let channels: [string, string][] = [];

        // Check if the content is JSON
        const trimmed = text.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          const parsed = parseJsonBackup(text);
          channels = parsed.map(c => [c.id, c.name]);
        } else {
          channels = await parseSubscriptionExport(text);
        }

        if (!channels || channels.length === 0) {
          setImportState("error");
          setErrorMessage("No valid channels were found in this file format.");
          return;
        }

        setImportState("subscribing");
        setProgress(60);
        
        let subbedCount = 0;
        const total = channels.length;

        // Subscribing sequence
        for (const channel of channels) {
          if (channel) {
            const [id, title] = channel;
            await subscribe(id, title);
            subbedCount++;
            
            // Animate progress up to 100%
            const subPercent = Math.round((subbedCount / total) * 40);
            setProgress(60 + subPercent);
          }
        }

        setImportedCount(subbedCount);
        setImportState("success");
      } catch (err: any) {
        console.error("Failed to parse and import subscriptions:", err);
        setImportState("error");
        setErrorMessage(err?.message || "An error occurred while parsing the subscription backup.");
      }
    };

    reader.onerror = () => {
      setImportState("error");
      setErrorMessage("Could not read the chosen file.");
    };

    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Hero Header */}
      <div className="mb-12">
        <h1 className="text-5xl font-semibold text-neutral-100 tracking-tight mb-3">
          Import your data
        </h1>
        <p className="text-lg text-neutral-400 max-w-2xl">
          Optionally populate your feed instantly by uploading your existing subscriptions from YouTube, NewPipe, or standard OPML backups.
        </p>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xml,.opml,.json,.csv,.txt"
        className="hidden"
      />

      {/* Upload area card */}
      <div
        onClick={handleCardClick}
        className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer min-h-[300px] mb-8 ${
          importState === "reading" || importState === "parsing" || importState === "subscribing"
            ? "border-zinc-800 bg-zinc-950/20 pointer-events-none"
            : importState === "success"
            ? "border-emerald-900 bg-emerald-950/10 hover:border-emerald-800"
            : importState === "error"
            ? "border-red-900 bg-red-950/10 hover:border-red-800"
            : "border-zinc-800 hover:border-zinc-600 bg-zinc-950/40 hover:bg-zinc-900/40"
        }`}
      >
        {importState === "idle" && (
          <div className="space-y-6">
            <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-700 mx-auto group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div className="space-y-2">
              <h4 className="text-lg font-bold text-zinc-200">Click to browse files</h4>
              <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
                Upload subscription_manager.xml, takeout.csv, or standard OPML backups.
              </p>
            </div>
          </div>
        )}

        {(importState === "reading" || importState === "parsing" || importState === "subscribing") && (
          <div className="w-full max-w-md space-y-6 px-4 select-none">
            <div className="flex justify-between items-center text-sm font-bold uppercase tracking-wider text-zinc-400">
              <span>
                {importState === "reading"
                  ? "Reading payload..."
                  : importState === "parsing"
                  ? "Calibrating extraction..."
                  : "Synchronizing channels..."}
              </span>
              <span className="text-primary">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {importState === "success" && (
          <div className="space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-950/40 flex items-center justify-center border border-emerald-500/30 mx-auto">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-2">
              <h4 className="text-lg font-bold text-emerald-400">Import successful</h4>
              <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                Natively registered {importedCount} creators to your subscriptions. Click to import another payload.
              </p>
            </div>
          </div>
        )}

        {importState === "error" && (
          <div className="space-y-6">
            <div className="w-16 h-16 rounded-full bg-red-950/40 flex items-center justify-center border border-red-500/30 mx-auto">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="space-y-2">
              <h4 className="text-lg font-bold text-red-400">Extraction error</h4>
              <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                {errorMessage || "The backup layout could not be recognized."} Click to retry with another file.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-2xl p-6 flex flex-col space-y-4 select-none">
        <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Supported formats</h4>
        <ul className="text-sm text-zinc-400 space-y-2 list-disc pl-5 leading-normal">
          <li><strong>Google Takeout:</strong> CSV export containing subscriptions list.</li>
          <li><strong>NewPipe & LibreTube:</strong> Standard exported JSON backups.</li>
          <li><strong>Standard OPML / XML:</strong> Feed schemas exported from FreeTube, RSS readers, or other players.</li>
        </ul>
      </div>
    </div>
  );
};

export default ImportStep;
