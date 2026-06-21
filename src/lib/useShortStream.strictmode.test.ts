import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { StreamInfo } from "../types/video";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeInfo(): StreamInfo {
  return {
    streamId: "s",
    localUrl: "http://127.0.0.1:9/stream/main",
    expiresAt: "",
    variants: [
      {
        id: "v",
        localUrl: "video-only",
        qualityLabel: "720p",
        mimeType: 'video/mp4; codecs="avc1.4d401f"',
        width: 720,
        height: 1280,
        fps: 30,
        bitrate: 1_000_000,
        isDefault: false,
        isPlayable: true,
        hasAudio: false,
        isVideoOnly: true,
        deliveryMethod: "progressive",
      },
    ],
    captions: [],
    audioTracks: [
      {
        id: "a",
        label: "Original",
        localUrl: "audio",
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        bitrate: 128_000,
        isDefault: true,
        available: true,
      },
    ],
    dashManifestUrl: "dash",
  };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("./api/youtube");
  vi.resetModules();
});

describe("useShortStream under StrictMode", () => {
  it("applies the resolved stream even when the mount effect is double-invoked", async () => {
    const getStreamInfo = vi.fn().mockResolvedValue(makeInfo());
    vi.resetModules();
    vi.doMock("./api/youtube", () => ({ getStreamInfo }));
    const { useShortStream } = await import("./useShortStream");

    let latest: ReturnType<typeof useShortStream> | null = null;
    function Harness() {
      latest = useShortStream("vid", true, 0);
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(Harness)));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getStreamInfo).toHaveBeenCalledTimes(1);
    expect(latest!.videoUrl).toBe("video-only");
    expect(latest!.audioUrl).toBe("audio");
    expect(latest!.loading).toBe(false);
    expect(latest!.unavailable).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });
});
