import { useEffect, useState } from "react";

import { proxyImageUrl } from "./api/images";

const proxyCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function isLoopbackUrl(url: string): boolean {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(url);
}

export function useProxiedImageUrl(src: string | null | undefined): string | undefined {
  const normalized = src?.trim();
  const [proxied, setProxied] = useState<string | undefined>(() => {
    if (!normalized) return undefined;
    if (isLoopbackUrl(normalized)) return normalized;
    return proxyCache.get(normalized);
  });

  useEffect(() => {
    if (!normalized) {
      setProxied(undefined);
      return;
    }
    if (isLoopbackUrl(normalized)) {
      setProxied(normalized);
      return;
    }

    const cached = proxyCache.get(normalized);
    if (cached) {
      setProxied(cached);
      return;
    }

    let active = true;
    const request = pending.get(normalized) ?? proxyImageUrl(normalized);
    pending.set(normalized, request);
    request
      .then((url) => {
        proxyCache.set(normalized, url);
        if (active) setProxied(url);
      })
      .catch(() => {
        if (active) setProxied(normalized);
      })
      .finally(() => {
        if (pending.get(normalized) === request) {
          pending.delete(normalized);
        }
      });

    return () => {
      active = false;
    };
  }, [normalized]);

  return proxied ?? normalized;
}
