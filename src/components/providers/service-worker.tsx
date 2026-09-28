"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (`public/sw.js`) in production builds.
 * Development skips it so a stored script never hides a change being worked on.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Not installable then, but the app itself works the same.
    });
  }, []);
  return null;
}
