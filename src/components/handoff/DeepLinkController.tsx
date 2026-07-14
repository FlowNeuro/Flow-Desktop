import { useDeepLinkHandoff } from "../../lib/useDeepLinkHandoff";

/**
 * Bridges the Flow browser extension to the app: routes `flow://` deep links and
 * loopback-bridge handoffs into playback or the download dialog. Renders nothing.
 */
export function DeepLinkController() {
  useDeepLinkHandoff();
  return null;
}
