import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Check, AlertCircle, FolderHeart, History, Tv, Loader2, Brain, Database, FileText } from "lucide-react";
import { unzipSync } from "fflate";
import { getSetting, setSetting, addWatchRecord } from "../lib/api/db";
import { logInteraction } from "../lib/api/recommendation";
import {
  convertFlowNeuroBrainData,
  extractFlowNeuroBrainCandidate,
  isFlowNeuroBrainCandidate,
} from "../lib/flowNeuroImport";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { parseSubscriptionExport } from "../lib/api/youtube";
import { getString } from "../lib/i18n/index";
import type { VideoSummary } from "../types/video";
import type { WatchHistoryRecord } from "../types/db";

interface ParseChannelResult { id: string; name: string; }
interface LocalPlaylist { id: string; name: string; description?: string; tracks: VideoSummary[]; }

export const ImportData: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importSubs, setImportSubs] = useState(true);
  const [importPlaylists, setImportPlaylists] = useState(true);
  const [importHistory, setImportHistory] = useState(true);
  const [importNeuro, setImportNeuro] = useState(true);

  const [importState, setImportState] = useState<"idle" | "reading" | "parsing" | "saving" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [subsCount, setSubsCount] = useState(0);
  const [playlistsCount, setPlaylistsCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [neuroCount, setNeuroCount] = useState(0);

  const { subscribe } = useSubscriptionStore();

  const handleCardClick = () => {
    if (["reading", "parsing", "saving"].includes(importState)) return;
    fileInputRef.current?.click();
  };

  const extractChannelIdFromUrl = (url: string): string => {
    if (!url) return "";
    let id = "";
    if (url.includes("/channel/")) { id = url.split("/channel/")[1] || ""; }
    else if (url.includes("/@")) { id = url.split("/@")[1] || ""; }
    else if (url.includes("/user/")) { id = url.split("/user/")[1] || ""; }
    else { id = url; }
    return (id.split("/")[0] || "").split("?")[0]?.trim() || "";
  };

  const parseJsonSubscriptions = (data: any): ParseChannelResult[] => {
    const channels: ParseChannelResult[] = [];
    let rawSubs: any[] = [];
    if (Array.isArray(data)) { rawSubs = data; }
    else if (data?.subscriptions && Array.isArray(data.subscriptions)) { rawSubs = data.subscriptions; }

    for (const item of rawSubs) {
      if (!item || typeof item !== "object") continue;
      if (item.channelId && (item.channelName || item.name)) {
        channels.push({ id: item.channelId.trim(), name: (item.channelName || item.name).trim() });
      } else if (item.url && item.name) {
        const id = extractChannelIdFromUrl(item.url);
        if (id) channels.push({ id, name: item.name.trim() });
      }
    }

    if (channels.length === 0 && data && typeof data === "object") {
      const visited = new Set<any>();
      const search = (obj: any) => {
        if (!obj || typeof obj !== "object" || visited.has(obj)) return;
        visited.add(obj);
        if (Array.isArray(obj)) { for (const val of obj) search(val); return; }
        const cId = obj.channelId || obj.id;
        const cName = obj.channelName || obj.name || obj.title;
        if (typeof cId === "string" && cId.startsWith("UC") && cId.length >= 20 && typeof cName === "string" && cName.length > 0) {
          channels.push({ id: cId.trim(), name: cName.trim() });
        } else { for (const key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) search(obj[key]); } }
      };
      search(data);
    }

    const seen = new Set<string>();
    return channels.filter(ch => { if (seen.has(ch.id)) return false; seen.add(ch.id); return true; });
  };

  const parseJsonWatchHistory = (data: any): WatchHistoryRecord[] => {
    if (!Array.isArray(data)) return [];
    return data.filter((item: any) => item.titleUrl).map((item: any) => {
      let videoId = "";
      try { videoId = item.titleUrl.includes("v=") ? item.titleUrl.split("v=")[1]?.split("&")[0] : item.titleUrl.split("/").pop(); } catch { return null; }
      if (!videoId || videoId.length < 10) return null;
      return { videoId, title: item.title ? item.title.replace("Watched ", "").trim() : "Watched Video", channelName: item.subtitles?.[0]?.name || "YouTube Creator", watchDate: item.time || new Date().toISOString(), watchDurationSeconds: 0, totalDurationSeconds: 0 };
    }).filter(Boolean) as WatchHistoryRecord[];
  };

  const parseFreeTubeWatchHistory = (text: string): WatchHistoryRecord[] => {
    return text.split("\n").filter(l => l.trim()).map(line => {
      try { const item = JSON.parse(line); if (!item.videoId) return null; return { videoId: item.videoId, title: item.title || "FreeTube Video", channelName: item.author || "Creator", watchDate: item.timeWatched ? new Date(item.timeWatched).toISOString() : new Date().toISOString(), watchDurationSeconds: item.watchProgress ? Math.round((item.lengthSeconds || 0) * item.watchProgress) : 0, totalDurationSeconds: item.lengthSeconds || 0 }; } catch { return null; }
    }).filter(Boolean) as WatchHistoryRecord[];
  };

  const parseHtmlWatchHistory = (html: string): WatchHistoryRecord[] => {
    const records: WatchHistoryRecord[] = [];
    const videoRegex = /href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{10,12})"[^>]*?>([^<]+)<\/a>/gi;
    const channelRegex = /href="https:\/\/www\.youtube\.com\/channel\/([^"&\s>]+)"[^>]*?>([^<]+)<\/a>/gi;
    const videoMatches: { index: number; id: string; title: string }[] = [];
    const channelMatches: { index: number; name: string }[] = [];
    let m;
    while ((m = videoRegex.exec(html)) !== null) { if (m[1] && m[2]) videoMatches.push({ index: m.index, id: m[1], title: m[2] }); }
    while ((m = channelRegex.exec(html)) !== null) { if (m[2]) channelMatches.push({ index: m.index, name: m[2] }); }
    let ci = 0;
    videoMatches.forEach((vid, i) => {
      while (ci < channelMatches.length && (channelMatches[ci]?.index ?? 0) < vid.index) ci++;
      const ch = channelMatches[ci];
      records.push({ videoId: vid.id, title: vid.title, channelName: ch && (ch.index - vid.index < 1200) ? ch.name : "YouTube Creator", watchDate: new Date(Date.now() - i * 60000).toISOString(), watchDurationSeconds: 0, totalDurationSeconds: 0 });
    });
    return records;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportState("reading"); setProgress(15); setStatusMessage(getString("import_reading")); setErrorMessage("");
    setSubsCount(0); setPlaylistsCount(0); setHistoryCount(0); setNeuroCount(0);
    const isZip = file.name.endsWith(".zip");
    const reader = new FileReader();
    reader.onprogress = (event) => { if (event.lengthComputable) setProgress(15 + Math.round((event.loaded / event.total) * 20)); };

    reader.onload = async (event) => {
      setImportState("parsing"); setProgress(40); setStatusMessage(getString("import_parsing"));
      try {
        let text = "";
        let backupData: any = null;
        if (isZip) {
          const ab = event.target?.result as ArrayBuffer;
          if (!ab) throw new Error("Empty archive buffer.");
          const dec = unzipSync(new Uint8Array(ab));
          const jk = Object.keys(dec).filter(k => k.toLowerCase().endsWith(".json"));
          const key = jk.find(k => /app[_-]?data|master[_-]?backup/i.test(k)) ?? jk.find(k => /engine[_-]?brain|neuro[_-]?brain|flow[_-]?brain/i.test(k)) ?? jk[0];
          if (!key) throw new Error("No JSON file found in archive.");
          text = new TextDecoder("utf-8").decode(dec[key]);
        } else { text = event.target?.result as string; }
        if (!text?.trim()) throw new Error("The imported backup is empty.");
        const trimmed = text.trim();
        const isJson = trimmed.startsWith("{") || trimmed.startsWith("[");
        const isHtml = trimmed.toLowerCase().includes("<html") || trimmed.toLowerCase().includes("<!doctype html");
        if (isJson) { try { backupData = JSON.parse(text); } catch { if (trimmed.includes("\n")) { backupData = { isFreeTubeHistory: true, rawText: text }; } else { throw new Error("Invalid JSON syntax."); } } }

        setImportState("saving"); setProgress(60); setStatusMessage(getString("import_writing"));
        let subbedCount = 0, playCount = 0, timelineCount = 0;

        let brainToImport: unknown | null = null;
        if (isJson && backupData) brainToImport = extractFlowNeuroBrainCandidate(backupData);
        if (importNeuro && brainToImport && isFlowNeuroBrainCandidate(brainToImport)) {
          setStatusMessage(getString("import_importing_neuro"));
          await setSetting("user_neuro_brain", JSON.stringify(convertFlowNeuroBrainData(brainToImport)));
          setNeuroCount(1);
        }

        if (importSubs) {
          let parsedSubs: ParseChannelResult[] = [];
          if (isJson && backupData && !backupData.isFreeTubeHistory) parsedSubs = parseJsonSubscriptions(backupData);
          else if (!isJson && !isHtml) { const arr = await parseSubscriptionExport(text); parsedSubs = arr.map(([id, name]) => ({ id, name })); }
          if (parsedSubs.length > 0) {
            setStatusMessage(getString("import_importing_subs", parsedSubs.length));
            for (let i = 0; i < parsedSubs.length; i++) { const sub = parsedSubs[i]; if (sub) { await subscribe(sub.id, sub.name); subbedCount++; } setProgress(60 + Math.round((subbedCount / parsedSubs.length) * 15)); }
            setSubsCount(subbedCount);
          }
        }

        if (importPlaylists && isJson && backupData?.playlists && Array.isArray(backupData.playlists)) {
          setStatusMessage(getString("import_restoring_playlists"));
          const pj = await getSetting("user_playlists"); const existing: LocalPlaylist[] = pj ? JSON.parse(pj) : [];
          const crossRefs = backupData.playlistVideos || []; const vids = backupData.videos || [];
          const parsed: LocalPlaylist[] = backupData.playlists.map((pl: any) => {
            const refs = crossRefs.filter((r: any) => r.playlistId === pl.id).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
            const tracks: VideoSummary[] = refs.map((ref: any) => vids.find((v: any) => v.id === ref.videoId)).filter(Boolean).map((vid: any) => ({ id: vid.id, title: vid.title, channelName: vid.channelName || "Unknown", thumbnailUrl: vid.thumbnailUrl || `https://i.ytimg.com/vi/${vid.id}/hqdefault.jpg`, durationSeconds: typeof vid.duration === "number" ? vid.duration : 0, publishedText: vid.uploadDate || "Uploaded recently", viewCountText: vid.viewCount ? `${vid.viewCount} views` : "Track" }));
            return { id: pl.id || `imported-${Date.now()}-${Math.random()}`, name: pl.name || "Imported Playlist", description: pl.description || "Imported from backup", tracks };
          });
          const merged = [...existing];
          for (const np of parsed) { const ei = merged.findIndex(p => p.id === np.id || p.name === np.name); if (ei !== -1) { const ep = merged[ei]; if (ep) { const ids = new Set(ep.tracks.map(t => t.id)); ep.tracks = [...ep.tracks, ...np.tracks.filter(t => !ids.has(t.id))]; } } else { merged.push(np); } playCount++; }
          await setSetting("user_playlists", JSON.stringify(merged));
          setPlaylistsCount(playCount);
        }

        if (importHistory) {
          let ph: WatchHistoryRecord[] = [];
          if (isJson && backupData) { if (backupData.isFreeTubeHistory) ph = parseFreeTubeWatchHistory(backupData.rawText); else if (backupData.viewHistory && Array.isArray(backupData.viewHistory)) ph = backupData.viewHistory.map((item: any) => ({ videoId: item.videoId, title: item.title || "Watched Video", channelName: item.channelName || "Unknown", watchDate: typeof item.timestamp === "number" ? new Date(item.timestamp).toISOString() : new Date().toISOString(), watchDurationSeconds: item.position ? Math.round(item.position / 1000) : 0, totalDurationSeconds: item.duration ? Math.round(item.duration / 1000) : 0 })); else ph = parseJsonWatchHistory(backupData); }
          else if (isHtml) ph = parseHtmlWatchHistory(text);
          if (ph.length > 0) {
            setStatusMessage(getString("import_importing_history", ph.length));
            const seedLimit = Math.min(ph.length, 50);
            for (let i = 0; i < ph.length; i++) {
              const r = ph[i]; if (r) { await addWatchRecord(r); timelineCount++;
                if (i < seedLimit) { try { await logInteraction(r.videoId, r.title, r.channelName || "Unknown", "imported_channel_id", "Seeded from backup", r.totalDurationSeconds || 300, false, false, "WATCH_PROGRESS", 1.0); } catch {} }
              } setProgress(75 + Math.round((timelineCount / ph.length) * 20));
            }
            setHistoryCount(timelineCount);
          }
        }

        setProgress(100); setImportState("success");
      } catch (err: any) { console.error("Import failure", err); setImportState("error"); setErrorMessage(err?.message || getString("import_file_not_recognized")); }
    };

    reader.onerror = () => { setImportState("error"); setErrorMessage("Failed to read file."); };
    if (isZip) reader.readAsArrayBuffer(file); else reader.readAsText(file);
  };

  const toggleItems = [
    { key: "subs", label: getString("import_subscriptions"), desc: getString("import_subscriptions_desc"), icon: <Tv size={16} />, checked: importSubs, toggle: () => setImportSubs(!importSubs) },
    { key: "playlists", label: getString("import_playlists"), desc: getString("import_playlists_desc"), icon: <FolderHeart size={16} />, checked: importPlaylists, toggle: () => setImportPlaylists(!importPlaylists) },
    { key: "history", label: getString("import_watch_history"), desc: getString("import_watch_history_desc"), icon: <History size={16} />, checked: importHistory, toggle: () => setImportHistory(!importHistory) },
    { key: "neuro", label: getString("import_neuro_profile"), desc: getString("import_neuro_profile_desc"), icon: <Brain size={16} />, checked: importNeuro, toggle: () => setImportNeuro(!importNeuro) },
  ];

  const formatItems = [
    { label: getString("import_format_flow"), ext: ".zip / .json" },
    { label: getString("import_format_takeout"), ext: ".csv / .html / .json" },
    { label: getString("import_format_newpipe"), ext: ".json" },
    { label: getString("import_format_freetube"), ext: ".json (NDJSON)" },
    { label: getString("import_format_opml"), ext: ".xml / .opml" },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-20 bg-[var(--color-background)]">
      <div className="border-b border-[var(--color-outline-variant)] pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/settings")} className="p-2 border border-neutral-800 hover:border-neutral-700 bg-surface-container-low hover:bg-surface-container rounded-xl text-neutral-400 hover:text-neutral-200 transition-colors duration-200 ease-out cursor-pointer">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-on-surface)]">{getString("import_title")}</h1>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">{getString("import_subtitle")}</p>
          </div>
        </div>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".zip,.json,.xml,.opml,.csv,.txt,.html" className="hidden" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
        <div className="space-y-6 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto pr-2 scrollbar-none">
          {importState === "idle" && (
            <div className="bg-surface-container-low rounded-2xl border border-neutral-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-800/50">
                <h3 className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">{getString("import_data_to_import")}</h3>
              </div>
              <div className="divide-y divide-neutral-800/50">
                {toggleItems.map((item) => (
                  <div key={item.key} onClick={item.toggle} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-container transition-colors duration-200 ease-out cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className={item.checked ? "text-[var(--color-primary)]" : "text-neutral-500"}>{item.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-neutral-200">{item.label}</div>
                        <div className="text-xs text-neutral-400 mt-0.5">{item.desc}</div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${item.checked ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-neutral-700 bg-surface-container-high"}`}>
                      {item.checked && <Check size={10} strokeWidth={3} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            onClick={handleCardClick}
            className={`border border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-colors duration-200 ease-out cursor-pointer min-h-[280px] ${
              ["reading", "parsing", "saving"].includes(importState) ? "border-neutral-800 bg-surface-container-low pointer-events-none"
              : importState === "success" ? "border-emerald-900 bg-surface-container-low hover:bg-surface-container"
              : importState === "error" ? "border-red-900 bg-surface-container-low hover:bg-surface-container"
              : "border-neutral-700 bg-surface-container-low hover:bg-surface-container hover:border-neutral-600"
            }`}
          >
            {importState === "idle" && (
              <div className="space-y-3 p-8">
                <div className="w-12 h-12 rounded-2xl bg-surface-container-high flex items-center justify-center border border-neutral-800 mx-auto">
                  <Upload className="w-5 h-5 text-neutral-400" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-medium text-neutral-200">{getString("import_select_file")}</h4>
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto">{getString("import_supported_formats")}</p>
                </div>
              </div>
            )}

            {["reading", "parsing", "saving"].includes(importState) && (
              <div className="w-full max-w-md space-y-4 px-8 py-8">
                <div className="flex justify-between items-center text-xs font-medium text-neutral-400">
                  <span>{statusMessage}</span>
                  <span className="font-mono text-neutral-300">{progress}%</span>
                </div>
                <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--color-primary)] transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex items-center justify-center gap-2 text-neutral-500 text-xs">
                  <Loader2 size={12} className="animate-spin" />
                  {getString("import_processing")}
                </div>
              </div>
            )}

            {importState === "success" && (
              <div className="space-y-3 p-8">
                <div className="w-12 h-12 rounded-2xl bg-surface-container-high flex items-center justify-center border border-emerald-900 mx-auto">
                  <Check className="w-5 h-5 text-emerald-500" />
                </div>
                <h4 className="text-base font-medium text-neutral-200">{getString("import_complete")}</h4>
                <div className="text-xs text-neutral-400 max-w-xs mx-auto space-y-1">
                  {subsCount > 0 && <div className="flex justify-between bg-surface-container-high px-3 py-2 rounded-lg"><span>{getString("import_subscriptions")}</span><span className="font-mono text-neutral-200">{subsCount}</span></div>}
                  {playlistsCount > 0 && <div className="flex justify-between bg-surface-container-high px-3 py-2 rounded-lg"><span>{getString("import_playlists")}</span><span className="font-mono text-neutral-200">{playlistsCount}</span></div>}
                  {historyCount > 0 && <div className="flex justify-between bg-surface-container-high px-3 py-2 rounded-lg"><span>{getString("import_watch_history")}</span><span className="font-mono text-neutral-200">{historyCount}</span></div>}
                  {neuroCount > 0 && <div className="flex justify-between bg-surface-container-high px-3 py-2 rounded-lg"><span>{getString("import_neuro_profile")}</span><span className="font-mono text-neutral-200">OK</span></div>}
                </div>
                <p className="text-xs text-neutral-500">{getString("import_click_another")}</p>
              </div>
            )}

            {importState === "error" && (
              <div className="space-y-3 p-8">
                <div className="w-12 h-12 rounded-2xl bg-surface-container-high flex items-center justify-center border border-red-900 mx-auto">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <h4 className="text-base font-medium text-red-400">{getString("import_failed")}</h4>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">{errorMessage || getString("import_file_not_recognized")}</p>
                <p className="text-xs text-neutral-500">{getString("import_try_another")}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 space-y-6">
          <div className="bg-surface-container-low rounded-2xl border border-neutral-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-800/50">
              <h3 className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">{getString("import_supported_formats_title")}</h3>
            </div>
            <div className="divide-y divide-neutral-800/50">
              {formatItems.map((f) => (
                <div key={f.label} className="flex items-center gap-3 px-5 py-3">
                  <FileText size={14} className="text-neutral-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-200">{f.label}</div>
                    <div className="text-xs text-neutral-500">{f.ext}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-low rounded-2xl border border-neutral-800 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database size={14} className="text-neutral-400" />
              <h4 className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">FlowNeuro</h4>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              When watch history or subscriptions are imported, the local recommendation engine automatically seeds interest profiles from titles, keywords, and creators.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportData;
