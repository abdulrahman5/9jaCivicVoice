"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (bot protection for the report form).
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set (local dev).
 * Calls onToken with a fresh token, or null when it expires or errors.
 * Change `resetKey` to get a new token after a failed submission.
 */

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(widgetId: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | undefined;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function Turnstile({
  onToken,
  onError,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  onError?: () => void;
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };

  useEffect(() => {
    if (!turnstileSiteKey || !container.current) return;
    let widgetId: string | undefined;
    let cancelled = false;
    callbacks.current.onToken(null);

    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: turnstileSiteKey,
          action: "report",
          appearance: "interaction-only",
          callback: (token: string) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => {
            callbacks.current.onToken(null);
            callbacks.current.onError?.();
          },
        });
      })
      .catch(() => callbacks.current.onError?.());

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [resetKey]);

  if (!turnstileSiteKey) return null;
  return <div ref={container} className="min-h-0" />;
}
