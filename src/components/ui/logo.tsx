"use client";

import { useState, type ReactNode } from "react";
import { brandInitials } from "@/lib/catalog/brands";

export function RemoteLogo({
  sources,
  fallback,
  size = 28,
  alt = "",
  className = "",
  rounded = "full",
}: {
  sources: string[];
  fallback: ReactNode;
  size?: number;
  alt?: string;
  className?: string;
  rounded?: "full" | "md";
}) {
  const key = sources.join("|");
  const [attempt, setAttempt] = useState({ key, index: 0 });
  if (attempt.key !== key) setAttempt({ key, index: 0 });
  const index = attempt.key === key ? attempt.index : 0;
  const src = sources[index];
  if (!src) return <>{fallback}</>;
  const next = () => setAttempt({ key, index: index + 1 });
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={next}
      onLoad={(e) => {
        const img = e.currentTarget;
        const tiny = img.naturalWidth > 0 && img.naturalWidth < 24;
        if (tiny && index < sources.length - 1) next();
      }}
      style={{ width: size, height: size }}
      className={`shrink-0 bg-white/0 object-contain ${rounded === "full" ? "rounded-full" : "rounded-[6px]"} ${className}`}
    />
  );
}

export function Monogram({
  name,
  color,
  size = 28,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: Math.round(size * 0.38),
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
      }}
    >
      {brandInitials(name)}
    </span>
  );
}
