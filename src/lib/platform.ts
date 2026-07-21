// Linux renders through WebKitGTK: media decodes via system GStreamer, and the
// UI composites on the CPU (the DMABUF renderer is disabled at startup for
// stability). Canvas readbacks of video frames and playbackRate changes are
// disproportionately expensive there, so several player/card behaviors gate on
// this. WebView2 (Windows) and WKWebView (macOS) are unaffected.
export const IS_LINUX_RUNTIME =
  typeof navigator !== "undefined" &&
  /Linux/i.test(navigator.userAgent) &&
  !/Android/i.test(navigator.userAgent);
