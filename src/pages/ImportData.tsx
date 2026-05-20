import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UploadCloud, Check, AlertCircle, Database, Sparkles, FolderHeart, History, Tv, Loader2 } from "lucide-react";
import { unzipSync } from "fflate";
import { getSetting, setSetting, addWatchRecord } from "../lib/api/db";
import { logInteraction } from "../lib/api/recommendation";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { parseSubscriptionExport } from "../lib/api/youtube";
import type { VideoSummary } from "../types/video";
import type { WatchHistoryRecord } from "../types/db";

interface ParseChannelResult {
  id: string;
  name: string;
}

interface LocalPlaylist {
  id: string;
  name: string;
  description?: string;
  tracks: VideoSummary[];
}

export const ImportData: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Selection States
  const [importSubs, setImportSubs] = useState(true);
  const [importPlaylists, setImportPlaylists] = useState(true);
  const [importHistory, setImportHistory] = useState(true);

  // Status States
  const [importState, setImportState] = useState<"idle" | "reading" | "parsing" | "saving" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Results
  const [subsCount, setSubsCount] = useState(0);
  const [playlistsCount, setPlaylistsCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);

  const { subscribe } = useSubscriptionStore();

  const handleCardClick = () => {
    if (["reading", "parsing", "saving"].includes(importState)) return;
    fileInputRef.current?.click();
  };

  // Helper to extract channel ID from various YouTube URL types
  const extractChannelIdFromUrl = (url: string): string => {
    if (!url) return "";
    let id = "";
    if (url.includes("/channel/")) {
      const parts = url.split("/channel/");
      id = parts[1] || "";
    } else if (url.includes("/@")) {
      const parts = url.split("/@");
      id = parts[1] || "";
    } else if (url.includes("/user/")) {
      const parts = url.split("/user/");
      id = parts[1] || "";
    } else {
      id = url;
    }
    const cleanParts1 = id.split("/");
    const basePart = cleanParts1[0] || "";
    const cleanParts2 = basePart.split("?");
    const finalId = cleanParts2[0] || "";
    return finalId.trim();
  };

  // Robust Subscriptions parser for JSON backups
  const parseJsonSubscriptions = (data: any): ParseChannelResult[] => {
    const channels: ParseChannelResult[] = [];
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

        if (item.channelId && item.channelName) {
          channels.push({ id: item.channelId.trim(), name: item.channelName.trim() });
        } else if (item.channelId && item.name) {
          channels.push({ id: item.channelId.trim(), name: item.name.trim() });
        } else if (item.url && item.name) {
          const id = extractChannelIdFromUrl(item.url);
          if (id) channels.push({ id, name: item.name.trim() });
        }
      }
    }

    // Fallback recursive search if empty
    if (channels.length === 0 && data && typeof data === "object") {
      const visited = new Set<any>();
      const search = (obj: any) => {
        if (!obj || typeof obj !== "object" || visited.has(obj)) return;
        visited.add(obj);

        if (Array.isArray(obj)) {
          for (const val of obj) search(val);
        } else {
          const channelId = obj.channelId || obj.id;
          const channelName = obj.channelName || obj.name || obj.title;

          if (
            typeof channelId === "string" &&
            channelId.startsWith("UC") && channelId.length >= 20 &&
            typeof channelName === "string" &&
            channelName.length > 0
          ) {
            channels.push({ id: channelId.trim(), name: channelName.trim() });
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

    const seen = new Set<string>();
    return channels.filter(ch => {
      if (seen.has(ch.id)) return false;
      seen.add(ch.id);
      return true;
    });
  };

  // Parser for YouTube Takeout watch-history.json
  const parseJsonWatchHistory = (data: any): WatchHistoryRecord[] => {
    const records: WatchHistoryRecord[] = [];
    if (!Array.isArray(data)) return [];

    for (const item of data) {
      if (!item.titleUrl) continue;
      
      let videoId = "";
      try {
        if (item.titleUrl.includes("v=")) {
          videoId = item.titleUrl.split("v=")[1]?.split("&")[0];
        } else {
          const parts = item.titleUrl.split("/");
          videoId = parts[parts.length - 1];
        }
      } catch {
        continue;
      }

      if (!videoId || videoId.length < 10) continue;

      const title = item.title ? item.title.replace("Watched ", "").trim() : "Watched Video";
      const channelName = item.subtitles?.[0]?.name || "YouTube Creator";

      records.push({
        videoId,
        title,
        channelName,
        watchDate: item.time || new Date().toISOString(),
        watchDurationSeconds: 0,
        totalDurationSeconds: 0
      });
    }
    return records;
  };

  // Parser for FreeTube watch history JSON (Line-delimited JSON)
  const parseFreeTubeWatchHistory = (text: string): WatchHistoryRecord[] => {
    const records: WatchHistoryRecord[] = [];
    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        const videoId = item.videoId;
        if (!videoId) continue;

        records.push({
          videoId,
          title: item.title || "FreeTube Saved Video",
          channelName: item.author || "FreeTube Creator",
          watchDate: item.timeWatched ? new Date(item.timeWatched).toISOString() : new Date().toISOString(),
          watchDurationSeconds: item.watchProgress ? Math.round((item.lengthSeconds || 0) * item.watchProgress) : 0,
          totalDurationSeconds: item.lengthSeconds || 0
        });
      } catch {
        // Skip malformed lines silently
      }
    }
    return records;
  };

  // Fast HTML Watch History Regex Parser for Google Takeout HTML exports
  const parseHtmlWatchHistory = (html: string): WatchHistoryRecord[] => {
    const records: WatchHistoryRecord[] = [];
    const videoRegex = /href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{10,12})"[^>]*?>([^<]+)<\/a>/gi;
    const channelRegex = /href="https:\/\/www\.youtube\.com\/channel\/([^"&\s>]+)"[^>]*?>([^<]+)<\/a>/gi;

    let videoMatch;
    const videoMatches: { index: number; id: string; title: string }[] = [];
    while ((videoMatch = videoRegex.exec(html)) !== null) {
      if (videoMatch[1] && videoMatch[2]) {
        videoMatches.push({
          index: videoMatch.index,
          id: videoMatch[1],
          title: videoMatch[2]
        });
      }
    }

    let channelMatch;
    const channelMatches: { index: number; id: string; name: string }[] = [];
    while ((channelMatch = channelRegex.exec(html)) !== null) {
      if (channelMatch[1] && channelMatch[2]) {
        channelMatches.push({
          index: channelMatch.index,
          id: channelMatch[1],
          name: channelMatch[2]
        });
      }
    }

    let channelIdx = 0;
    videoMatches.forEach((vid, i) => {
      // Find nearest succeeding channel link within context limits
      while (channelIdx < channelMatches.length) {
        const match = channelMatches[channelIdx];
        if (match && match.index < vid.index) {
          channelIdx++;
        } else {
          break;
        }
      }

      const matchChan = channelMatches[channelIdx];
      const channelName = matchChan && (matchChan.index - vid.index < 1200) ? matchChan.name : "YouTube Creator";

      records.push({
        videoId: vid.id,
        title: vid.title,
        channelName,
        watchDate: new Date(Date.now() - i * 60000).toISOString(), // Mock offset timestamps to preserve visual chronology
        watchDurationSeconds: 0,
        totalDurationSeconds: 0
      });
    });

    return records;
  };

  // Main Upload File Parser
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportState("reading");
    setProgress(15);
    setStatusMessage("Decompressing storage blocks...");
    setErrorMessage("");
    
    setSubsCount(0);
    setPlaylistsCount(0);
    setHistoryCount(0);

    const isZip = file.name.endsWith(".zip");
    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 20);
        setProgress(15 + percent); // read phase covers 15% - 35%
      }
    };

    reader.onload = async (event) => {
      setImportState("parsing");
      setProgress(40);
      setStatusMessage("Parsing database blueprints...");

      try {
        let text = "";
        let backupData: any = null;

        // 1. Decompress ZIP or parse raw text
        if (isZip) {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          if (!arrayBuffer) throw new Error("The chosen archive buffer is empty.");
          
          const decompressed = unzipSync(new Uint8Array(arrayBuffer));
          const jsonKey = Object.keys(decompressed).find(k => k.endsWith(".json"));
          if (!jsonKey) {
            throw new Error("No database export JSON file was found inside this master backup ZIP.");
          }
          
          const bytes = decompressed[jsonKey];
          text = new TextDecoder("utf-8").decode(bytes);
        } else {
          text = event.target?.result as string;
        }

        if (!text || !text.trim()) {
          throw new Error("The imported backup is empty or unreadable.");
        }

        // 2. Classify text backup data type
        const trimmed = text.trim();
        const isJson = trimmed.startsWith("{") || trimmed.startsWith("[");
        const isHtml = trimmed.toLowerCase().includes("<html") || trimmed.toLowerCase().includes("<!doctype html");

        if (isJson) {
          try {
            backupData = JSON.parse(text);
          } catch {
            // Check if it's FreeTube line-delimited JSON
            if (trimmed.includes("\n")) {
              backupData = { isFreeTubeHistory: true, rawText: text };
            } else {
              throw new Error("Failed to compile JSON structure. File contains syntax errors.");
            }
          }
        }

        setImportState("saving");
        setProgress(60);
        setStatusMessage("Populating system tables...");

        let subbedCount = 0;
        let playCount = 0;
        let timelineCount = 0;

        // ==========================================
        // FEATURE A: SUBSCRIPTIONS IMPORT
        // ==========================================
        if (importSubs) {
          let parsedSubs: ParseChannelResult[] = [];
          if (isJson && backupData && !backupData.isFreeTubeHistory) {
            parsedSubs = parseJsonSubscriptions(backupData);
          } else if (!isJson && !isHtml) {
            // Standard OPML XML or YouTube CSV
            const parsedArray = await parseSubscriptionExport(text);
            parsedSubs = parsedArray.map(([id, name]) => ({ id, name }));
          }

          if (parsedSubs.length > 0) {
            setStatusMessage(`Synchronizing ${parsedSubs.length} subscriptions...`);
            const total = parsedSubs.length;
            for (let i = 0; i < total; i++) {
              const sub = parsedSubs[i];
              if (sub) {
                await subscribe(sub.id, sub.name);
                subbedCount++;
              }
              
              // Progress tracking
              const subPercent = Math.round((subbedCount / total) * 15);
              setProgress(60 + subPercent); // covers 60% - 75%
            }
            setSubsCount(subbedCount);
          }
        }

        // ==========================================
        // FEATURE B: PLAYLISTS IMPORT
        // ==========================================
        if (importPlaylists && isJson && backupData && backupData.playlists && Array.isArray(backupData.playlists)) {
          setStatusMessage("Restoring custom media playlists...");
          const playlistsJson = await getSetting("user_playlists");
          const existingPlaylists: LocalPlaylist[] = playlistsJson ? JSON.parse(playlistsJson) : [];
          
          const parsedPlaylists: LocalPlaylist[] = [];
          const crossRefs = backupData.playlistVideos || [];
          const backupVideos = backupData.videos || [];

          for (const pl of backupData.playlists) {
            const matches = crossRefs
              .filter((ref: any) => ref.playlistId === pl.id)
              .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

            const tracks: VideoSummary[] = [];
            for (const ref of matches) {
              const vid = backupVideos.find((v: any) => v.id === ref.videoId);
              if (vid) {
                tracks.push({
                  id: vid.id,
                  title: vid.title,
                  channelName: vid.channelName || "Unknown Artist",
                  thumbnailUrl: vid.thumbnailUrl || `https://i.ytimg.com/vi/${vid.id}/hqdefault.jpg`,
                  durationSeconds: typeof vid.duration === "number" ? vid.duration : 0,
                  publishedText: vid.uploadDate || "Uploaded recently",
                  viewCountText: vid.viewCount ? `${vid.viewCount} views` : "Track",
                });
              }
            }

            parsedPlaylists.push({
              id: pl.id || `imported-${Date.now()}-${Math.random()}`,
              name: pl.name || "Imported Playlist",
              description: pl.description || "Imported from backup",
              tracks,
            });
          }

          const merged = [...existingPlaylists];
          for (const newPl of parsedPlaylists) {
            const existsIdx = merged.findIndex(p => p.id === newPl.id || p.name === newPl.name);
            if (existsIdx !== -1) {
              const existingPl = merged[existsIdx];
              if (existingPl) {
                const trackIds = new Set(existingPl.tracks.map(t => t.id));
                const uniqueNewTracks = newPl.tracks.filter(t => !trackIds.has(t.id));
                existingPl.tracks = [...existingPl.tracks, ...uniqueNewTracks];
              }
            } else {
              merged.push(newPl);
            }
            playCount++;
          }

          await setSetting("user_playlists", JSON.stringify(merged));
          setPlaylistsCount(playCount);
        }

        // ==========================================
        // FEATURE C: WATCH HISTORY IMPORT
        // ==========================================
        if (importHistory) {
          let parsedHistory: WatchHistoryRecord[] = [];

          if (isJson && backupData) {
            if (backupData.isFreeTubeHistory) {
              parsedHistory = parseFreeTubeWatchHistory(backupData.rawText);
            } else if (backupData.viewHistory && Array.isArray(backupData.viewHistory)) {
              // Flow Backup History mapping
              parsedHistory = backupData.viewHistory.map((item: any) => ({
                videoId: item.videoId,
                title: item.title || "Watched Video",
                channelName: item.channelName || "Unknown Channel",
                watchDate: typeof item.timestamp === "number" ? new Date(item.timestamp).toISOString() : new Date().toISOString(),
                watchDurationSeconds: item.position ? Math.round(item.position / 1000) : 0,
                totalDurationSeconds: item.duration ? Math.round(item.duration / 1000) : 0
              }));
            } else {
              // YouTube Takeout JSON
              parsedHistory = parseJsonWatchHistory(backupData);
            }
          } else if (isHtml) {
            // YouTube Takeout HTML
            parsedHistory = parseHtmlWatchHistory(text);
          }

          if (parsedHistory.length > 0) {
            setStatusMessage(`Integrating watch history timeline...`);
            const total = parsedHistory.length;
            const seedLimit = Math.min(total, 50); // Seed up to 50 items in Flow Neuro to instantly configure learning weights
            
            for (let i = 0; i < total; i++) {
              const record = parsedHistory[i];
              if (record) {
                await addWatchRecord(record);
                timelineCount++;

                // Neural bootstrapping interaction log
                if (i < seedLimit) {
                  try {
                    await logInteraction(
                      record.videoId,
                      record.title,
                      record.channelName || "Unknown Channel",
                      "imported_channel_id",
                      "Seeded from imported watch history backup",
                      record.totalDurationSeconds || 300,
                      false,
                      false,
                      "WATCH_PROGRESS",
                      1.0
                    );
                  } catch {
                    // Silently absorb recommendation seeding errors
                  }
                }
              }

              // Update progress bar
              const histPercent = Math.round((timelineCount / total) * 20);
              setProgress(75 + histPercent); // covers 75% - 95%
            }
            setHistoryCount(timelineCount);
          }
        }

        setProgress(100);
        setImportState("success");
      } catch (err: any) {
        console.error("Critical Import failure", err);
        setImportState("error");
        setErrorMessage(err?.message || "An unexpected error occurred during database migration.");
      }
    };

    reader.onerror = () => {
      setImportState("error");
      setErrorMessage("System failed to establish stream link with the chosen backup file.");
    };

    if (isZip) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-20 select-none">
      {/* Standalone Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/settings")}
          className="p-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-950 hover:bg-zinc-900/60 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
            Import Database Vault
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Natively populate subscriptions, playlists, and watch history directly from backup archives
          </p>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".zip,.json,.xml,.opml,.csv,.txt,.html"
        className="hidden"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Work Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Target Features Selection checkboxes */}
          {importState === "idle" && (
            <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Database size={16} className="text-red-500" />
                Select database tables to merge
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Checkbox Subscriptions */}
                <div
                  onClick={() => setImportSubs(!importSubs)}
                  className={`border rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between h-[120px] ${
                    importSubs
                      ? "border-red-500/20 bg-red-950/5 text-zinc-200"
                      : "border-zinc-850 hover:border-zinc-700 bg-zinc-950/20 text-zinc-400"
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <Tv size={18} className={importSubs ? "text-red-500" : "text-zinc-500"} />
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                      importSubs ? "border-red-500 bg-red-600 text-white" : "border-zinc-700 bg-zinc-900"
                    }`}>
                      {importSubs && <Check size={10} strokeWidth={3} />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">Subscriptions</h4>
                    <p className="text-[10px] text-zinc-500 mt-0.5 leading-normal">Parse and subscribe to creators</p>
                  </div>
                </div>

                {/* Checkbox Playlists */}
                <div
                  onClick={() => setImportPlaylists(!importPlaylists)}
                  className={`border rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between h-[120px] ${
                    importPlaylists
                      ? "border-red-500/20 bg-red-950/5 text-zinc-200"
                      : "border-zinc-850 hover:border-zinc-700 bg-zinc-950/20 text-zinc-400"
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <FolderHeart size={18} className={importPlaylists ? "text-red-500" : "text-zinc-500"} />
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                      importPlaylists ? "border-red-500 bg-red-600 text-white" : "border-zinc-700 bg-zinc-900"
                    }`}>
                      {importPlaylists && <Check size={10} strokeWidth={3} />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">Playlists</h4>
                    <p className="text-[10px] text-zinc-500 mt-0.5 leading-normal">Reconstruct custom video list collections</p>
                  </div>
                </div>

                {/* Checkbox History */}
                <div
                  onClick={() => setImportHistory(!importHistory)}
                  className={`border rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between h-[120px] ${
                    importHistory
                      ? "border-red-500/20 bg-red-950/5 text-zinc-200"
                      : "border-zinc-850 hover:border-zinc-700 bg-zinc-950/20 text-zinc-400"
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <History size={18} className={importHistory ? "text-red-500" : "text-zinc-500"} />
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                      importHistory ? "border-red-500 bg-red-600 text-white" : "border-zinc-700 bg-zinc-900"
                    }`}>
                      {importHistory && <Check size={10} strokeWidth={3} />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">Watch History</h4>
                    <p className="text-[10px] text-zinc-500 mt-0.5 leading-normal">Seed learning timeline records</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Core Upload Card container */}
          <div
            onClick={handleCardClick}
            className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer min-h-[320px] ${
              ["reading", "parsing", "saving"].includes(importState)
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
                <div className="w-16 h-16 rounded-full bg-zinc-950 flex items-center justify-center border border-zinc-800 mx-auto">
                  <UploadCloud className="w-8 h-8 text-zinc-400" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-zinc-200">Upload backup payload</h4>
                  <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                    Click to browse files. Supports Flow Master backups (.zip containing app_data.json), OPML XML, YouTube Takeout CSV/HTML/JSON, or FreeTube history formats.
                  </p>
                </div>
              </div>
            )}

            {["reading", "parsing", "saving"].includes(importState) && (
              <div className="w-full max-w-md space-y-6 px-4">
                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <span>{statusMessage}</span>
                  <span className="text-red-500">{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-center gap-2 text-zinc-600 text-[10px] font-bold uppercase">
                  <Loader2 size={12} className="animate-spin text-red-500" />
                  Aligning cluster telemetry...
                </div>
              </div>
            )}

            {importState === "success" && (
              <div className="space-y-6">
                <div className="w-16 h-16 rounded-full bg-emerald-950/40 flex items-center justify-center border border-emerald-500/30 mx-auto animate-[pulse_2s_infinite]">
                  <Check className="w-8 h-8 text-emerald-500" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-emerald-400">Database vault successfully integrated</h4>
                  <div className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed pt-2 space-y-1">
                    {subsCount > 0 && <p className="flex justify-between bg-zinc-950 p-2 rounded-xl border border-zinc-900"><span>Subscriptions Imported</span> <span className="font-bold text-zinc-200">{subsCount} creators</span></p>}
                    {playlistsCount > 0 && <p className="flex justify-between bg-zinc-950 p-2 rounded-xl border border-zinc-900"><span>Custom Playlists Restored</span> <span className="font-bold text-zinc-200">{playlistsCount} folders</span></p>}
                    {historyCount > 0 && <p className="flex justify-between bg-zinc-950 p-2 rounded-xl border border-zinc-900"><span>Watch history items imported</span> <span className="font-bold text-zinc-200">{historyCount} items</span></p>}
                  </div>
                  <p className="text-[10px] text-zinc-500 pt-3">Click anywhere inside the card to upload another payload.</p>
                </div>
              </div>
            )}

            {importState === "error" && (
              <div className="space-y-6">
                <div className="w-16 h-16 rounded-full bg-red-950/40 flex items-center justify-center border border-red-500/30 mx-auto">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-red-400">Payload calibration failure</h4>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                    {errorMessage || "The backup archive does not comply with standard database schemas."}
                  </p>
                  <p className="text-[10px] text-zinc-500 pt-3">Click inside the card to retry with another file.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Informational Guidelines Side Column */}
        <div className="space-y-6">
          <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Sparkles size={16} className="text-red-500 animate-[pulse_2s_infinite]" />
              Flow Neuro Neural Seed
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When watch history or subscriptions are imported, Flow Neuro's isolated offline ranker seeds interests automatically from titles, keywords, and creator labels, immediately tailoring feeds to your taste.
            </p>
          </div>

          <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Supported Schemas</h4>
            <div className="text-xs text-zinc-400 space-y-3">
              <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/60">
                <span className="font-bold text-zinc-300 block mb-1">Flow Master Backup (.zip)</span>
                Fully restores subscriptions, watch history, and playlists. Unzipped <code>app_data.json</code> is also fully supported.
              </div>

              <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/60">
                <span className="font-bold text-zinc-300 block mb-1">Google Takeout CSV/HTML</span>
                Directly parses <code>subscriptions.csv</code> (Subscriptions) and <code>watch-history.html</code> or <code>watch-history.json</code> (Watch History).
              </div>

              <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/60">
                <span className="font-bold text-zinc-300 block mb-1">NewPipe & LibreTube</span>
                Accepts NewPipe standard backups, JSON subscriptions, and database files.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportData;
