import { invokeBackend } from "./errors";

export function proxyImageUrl(url: string): Promise<string> {
  return invokeBackend<string>("proxy_image_url", { url });
}
