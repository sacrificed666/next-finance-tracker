"use client";

import { useEffect } from "react";

export function PrintTheme() {
  useEffect(() => {
    const root = document.documentElement;
    let previous: string | null = null;
    const before = () => {
      if (previous === null) previous = root.getAttribute("data-theme") ?? "";
      root.setAttribute("data-theme", "light");
    };
    const after = () => {
      if (previous) root.setAttribute("data-theme", previous);
      previous = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return null;
}
