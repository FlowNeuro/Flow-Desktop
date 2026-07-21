// H.264 decodes everywhere (including Linux WebKitGTK with only gst-libav);
// VP9/AV1 depend on optional GStreamer plugins, so they rank as a bonus.
export function codecRank(mime?: string | null): number {
  const value = mime?.toLowerCase() ?? "";
  if (value.includes("avc1") || value.includes("avc3") || value.includes("h264")) return 0;
  if (value.includes("vp9") || value.includes("vp09")) return 1;
  if (value.includes("av01")) return 2;
  return 3;
}
