import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  MonitorSmartphone,
  QrCode,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";

import { Button } from "../components/ui/Button";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { SettingsGroup } from "../components/settings/SettingsGroup";
import { SettingItem } from "../components/settings/SettingItem";
import { useSyncStore } from "../store/useSyncStore";
import { SYNC_COLLECTIONS, type ManifestInfo, type StatInfo } from "../lib/api/sync";

const COLLECTION_LABELS: Record<string, string> = Object.fromEntries(
  SYNC_COLLECTIONS.map((c) => [c.key, c.label]),
);

function prettyCollection(key: string): string {
  return COLLECTION_LABELS[key] ?? key.replace(/_/g, " ");
}

// --------------------------------------------------------------------------------------------
// Shared small pieces
// --------------------------------------------------------------------------------------------

function SasDisplay({ sas }: { sas: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">
        Verification code
      </span>
      <span className="font-mono text-3xl tracking-[0.3em] text-neutral-100">{sas}</span>
      <span className="text-xs text-neutral-400">Make sure both devices show the same code.</span>
    </div>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

function StatsTable({ stats }: { stats: StatInfo[] }) {
  const meaningful = stats.filter(
    (s) => s.added + s.updated + s.tombstoned > 0 || s.skipped > 0,
  );
  if (meaningful.length === 0) {
    return <p className="text-sm text-neutral-400">Everything was already up to date.</p>;
  }
  return (
    <div className="bg-surface-container-low rounded-2xl border border-neutral-800 divide-y divide-neutral-800/50">
      {meaningful.map((s) => (
        <div key={s.collection} className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-neutral-200">{prettyCollection(s.collection)}</span>
          <span className="font-mono text-xs text-neutral-400">
            {s.added > 0 && <span className="text-green-400">+{s.added} new </span>}
            {s.updated > 0 && <span className="text-blue-400">{s.updated} updated </span>}
            {s.tombstoned > 0 && <span className="text-amber-400">{s.tombstoned} removed </span>}
            {s.added + s.updated + s.tombstoned === 0 && <span>up to date</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Camera scanner
// --------------------------------------------------------------------------------------------

function CameraScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserQRCodeReader();
    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (result) => {
            if (result && !cancelled) {
              const text = result.getText();
              controlsRef.current?.stop();
              onResult(text);
            }
          },
        );
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            "Could not start the camera. Paste the code manually instead, or check camera permissions.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onResult]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-2xl border border-neutral-800 bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/70" />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button variant="ghost" size="sm" onClick={onClose}>
        <X className="h-4 w-4" /> Stop camera
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Start screen (idle): choose send or receive
// --------------------------------------------------------------------------------------------

function StartScreen() {
  const { device, startHost, hostReceive, join, busy } = useSyncStore();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(SYNC_COLLECTIONS.map((c) => c.key)),
  );
  const [scanning, setScanning] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const onConnect = () => {
    const text = paste.trim();
    // Common mistake: pasting the 6-digit verification code instead of the QR data.
    if (/^\d{4,8}$/.test(text)) {
      setPasteError(
        "That's the verification code, not the sync code. Scan the QR with the camera, or paste the full sync data (it starts with “{”).",
      );
      return;
    }
    if (!text.startsWith("{")) {
      setPasteError("This doesn't look like a sync code. Scan the QR with the camera instead.");
      return;
    }
    setPasteError(null);
    void join(text);
  };

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onScanned = useCallback(
    (text: string) => {
      setScanning(false);
      void join(text);
    },
    [join],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Send */}
      <div className="rounded-2xl border border-neutral-800 bg-surface-container-low p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-medium text-neutral-100">Send from this device</h2>
            <p className="text-sm text-neutral-400">Show a code for your phone to scan.</p>
          </div>
        </div>

        <SettingsGroup title="What to send">
          {SYNC_COLLECTIONS.map((c) => (
            <SettingItem key={c.key} title={c.label} description={c.description}>
              <ToggleSwitch checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
            </SettingItem>
          ))}
        </SettingsGroup>

        <Button
          variant="primary"
          className="w-full"
          disabled={busy || selected.size === 0}
          onClick={() => void startHost([...selected])}
        >
          {busy ? <Spinner className="h-4 w-4" /> : <QrCode className="h-4 w-4" />} Generate sync code
        </Button>
      </div>

      {/* Receive */}
      <div className="rounded-2xl border border-neutral-800 bg-surface-container-low p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-medium text-neutral-100">Receive on this device</h2>
            <p className="text-sm text-neutral-400">Scan or paste a code from another device.</p>
          </div>
        </div>

        {scanning ? (
          <CameraScanner onResult={onScanned} onClose={() => setScanning(false)} />
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setScanning(true)}>
            <Camera className="h-4 w-4" /> Scan with camera
          </Button>
        )}

        <div className="space-y-2">
          <span className="text-xs uppercase tracking-widest text-neutral-500 font-semibold px-1">
            Or paste the sync data
          </span>
          <textarea
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              if (pasteError) setPasteError(null);
            }}
            placeholder={'Paste the full sync data (starts with "{") — not the 6-digit code'}
            rows={3}
            className="w-full resize-none rounded-lg border border-neutral-800 bg-surface-container px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-[var(--color-primary)] focus:outline-none"
          />
          {pasteError && <p className="px-1 text-xs text-red-400">{pasteError}</p>}
          <Button
            variant="primary"
            className="w-full"
            disabled={busy || paste.trim().length === 0}
            onClick={onConnect}
          >
            {busy ? <Spinner className="h-4 w-4" /> : <MonitorSmartphone className="h-4 w-4" />} Connect
          </Button>
        </div>

        <div className="border-t border-neutral-800 pt-3">
          <Button variant="ghost" className="w-full" disabled={busy} onClick={() => void hostReceive()}>
            <QrCode className="h-4 w-4" /> No camera? Show a QR for the other device to scan
          </Button>
          <p className="mt-1 px-1 text-xs text-neutral-500">
            This PC shows a code; the other device scans it and sends its data here.
          </p>
        </div>
      </div>

      {device && (
        <p className="col-span-full text-center text-xs text-neutral-500">
          This device: <span className="text-neutral-300">{device.deviceName}</span>
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Hosting screen (QR + SAS)
// --------------------------------------------------------------------------------------------

function HostingScreen() {
  const { hostInfo, cancel } = useSyncStore();
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!hostInfo) return;
    const tick = () => setRemaining(Math.max(0, hostInfo.expiresAt - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hostInfo]);

  if (!hostInfo) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner className="h-6 w-6 text-neutral-400" />
        <p className="text-sm text-neutral-400">Preparing…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-2xl border border-neutral-800 bg-surface-container-low p-8">
      <div className="text-center">
        <h2 className="text-base font-medium text-neutral-100">
          {hostInfo.receive ? "Show this to the other device" : "Scan this with your phone"}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          {hostInfo.receive
            ? "On the other device, scan this code and choose what to send to this PC."
            : "Open Flow on the other device and scan to receive your data."}
        </p>
      </div>

      <div className="rounded-2xl bg-white p-4">
        <QRCodeSVG value={hostInfo.qr} size={232} level="M" marginSize={1} />
      </div>

      <SasDisplay sas={hostInfo.sas} />

      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Spinner className="h-3.5 w-3.5" />
        Waiting for a device to connect{remaining > 0 ? ` · expires in ${remaining}s` : " · expired"}
      </div>

      <Button variant="ghost" onClick={() => void cancel()}>
        <X className="h-4 w-4" /> Cancel
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Consent screen (both roles)
// --------------------------------------------------------------------------------------------

function ConsentScreen() {
  const { status, respondConsent } = useSyncStore();
  const isMerge = status.consentKind === "clientMerge";
  const peerName = status.peer?.deviceName ?? "another device";
  const manifests: ManifestInfo[] = status.manifests ?? [];

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-2xl border border-neutral-800 bg-surface-container-low p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
        <ShieldCheck className="h-6 w-6" />
      </div>

      <div className="text-center">
        <h2 className="text-base font-medium text-neutral-100">
          {isMerge ? `Merge data from ${peerName}?` : `Allow ${peerName} to sync?`}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          {isMerge
            ? "Review what will be merged into this device."
            : "This device will send the selected data to the connected device."}
        </p>
      </div>

      {status.sas && <SasDisplay sas={status.sas} />}

      {isMerge && manifests.length > 0 && (
        <div className="w-full rounded-2xl border border-neutral-800 bg-surface-container divide-y divide-neutral-800/50">
          {manifests.map((m) => (
            <div key={m.collection} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-neutral-200">{prettyCollection(m.collection)}</span>
              <span className="font-mono text-xs text-neutral-400">{m.recordCount} items</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex w-full gap-3">
        <Button variant="destructive" className="flex-1" onClick={() => void respondConsent(false)}>
          <X className="h-4 w-4" /> Deny
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => void respondConsent(true)}>
          <Check className="h-4 w-4" /> {isMerge ? "Merge" : "Allow"}
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Transient screens
// --------------------------------------------------------------------------------------------

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 rounded-2xl border border-neutral-800 bg-surface-container-low p-8 text-center">
      {children}
    </div>
  );
}

function ProgressScreen({ label }: { label: string }) {
  return (
    <CenteredCard>
      <Spinner className="h-8 w-8 text-[var(--color-primary)]" />
      <p className="text-sm text-neutral-300">{label}</p>
    </CenteredCard>
  );
}

function CompletedScreen() {
  const { status, reset } = useSyncStore();
  const isClient = status.role === "client";
  return (
    <CenteredCard>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-400">
        <Check className="h-6 w-6" />
      </div>
      <h2 className="text-base font-medium text-neutral-100">Sync complete</h2>
      {isClient && status.stats ? (
        <div className="w-full text-left">
          <StatsTable stats={status.stats} />
        </div>
      ) : (
        <p className="text-sm text-neutral-400">Your data was sent successfully.</p>
      )}
      <Button variant="primary" onClick={() => void reset()}>
        Done
      </Button>
    </CenteredCard>
  );
}

function MessageScreen({ icon, title, message }: { icon: React.ReactNode; title: string; message?: string }) {
  const { reset } = useSyncStore();
  return (
    <CenteredCard>
      {icon}
      <h2 className="text-base font-medium text-neutral-100">{title}</h2>
      {message && <p className="text-sm text-neutral-400">{message}</p>}
      <Button variant="secondary" onClick={() => void reset()}>
        <RotateCcw className="h-4 w-4" /> Start over
      </Button>
    </CenteredCard>
  );
}

// --------------------------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------------------------

export default function Sync() {
  const { status, error, init } = useSyncStore();

  useEffect(() => {
    void init();
  }, [init]);

  const body = useMemo(() => {
    switch (status.phase) {
      case "hosting":
        return <HostingScreen />;
      case "connecting":
        return <ProgressScreen label="Connecting to the other device…" />;
      case "awaitingConsent":
        return <ConsentScreen />;
      case "transferring":
        return <ProgressScreen label="Syncing your data…" />;
      case "completed":
        return <CompletedScreen />;
      case "declined":
        return (
          <MessageScreen
            icon={
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-700/40 text-neutral-300">
                <X className="h-6 w-6" />
              </div>
            }
            title="Sync was declined"
            message="No data was transferred."
          />
        );
      case "error":
        return (
          <MessageScreen
            icon={
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400">
                <X className="h-6 w-6" />
              </div>
            }
            title="Sync failed"
            message={status.message ?? error ?? "Something went wrong."}
          />
        );
      default:
        return <StartScreen />;
    }
  }, [status, error]);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        <MonitorSmartphone className="h-7 w-7 text-[var(--color-primary)]" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-100">Flow Sync</h1>
          <p className="text-sm text-neutral-400">
            Move playlists, history, likes and your taste profile between your devices — over your
            local network, end-to-end encrypted, no account needed.
          </p>
        </div>
      </header>

      {error && status.phase === "idle" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          <ArrowLeft className="h-4 w-4 rotate-180" /> {error}
        </div>
      )}

      {body}
    </div>
  );
}
