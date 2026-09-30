"use client";

import { useState } from "react";
import type { gamification, Tier } from "@/lib/finance/achievements";

export interface Profile {
  id: string;
  email: string | null;
  emailVerified: string | null;
  name: string | null;
  image: string | null;
  about: string | null;
  occupation: string | null;
  location: string | null;
  website: string | null;
  birthday: string | null;
  locale: string | null;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
  twoFactor: boolean;
  recoveryLeft: number;
  passkeys: number;
}

export type Game = ReturnType<typeof gamification>;

export const TIERS: Tier[] = ["bronze", "silver", "gold", "platinum"];

export const TIER_COLOR: Record<Tier, string> = {
  bronze: "#c07a3e",
  silver: "#a8b0b8",
  gold: "#e0b43a",
  platinum: "#7fd4e6",
};

export function Avatar({ name, email, image, size = 64 }: { name: string; email: string; image: string; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const initial = (name || email || "?").trim().charAt(0).toUpperCase();
  if (!image || broken === image) {
    return (
      <span
        aria-hidden
        className="btn-gradient flex shrink-0 items-center justify-center rounded-field font-black shadow-md"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {initial}
      </span>
    );
  }
  return (
    <img
      src={image}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(image)}
      className="shrink-0 rounded-field object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function ScoreRing({ score, tone }: { score: number; tone: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <svg width={108} height={108} viewBox="0 0 108 108" role="img" aria-label={`${score}/100`} className="shrink-0">
      <circle cx={54} cy={54} r={r} fill="none" stroke="var(--fill-ghost)" strokeWidth={10} />
      <circle
        cx={54}
        cy={54}
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 54 54)"
        style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.22,0.68,0.24,1)" }}
      />
      <text x={54} y={54} textAnchor="middle" dominantBaseline="central" className="fill-ink-1" fontSize={28} fontWeight={800}>
        {score}
      </text>
    </svg>
  );
}

export function ageFrom(birthday: string): number {
  const born = new Date(`${birthday}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

export function healthTone(grade: Game["health"]["grade"]): string {
  return grade === "excellent" || grade === "good"
    ? "var(--income)"
    : grade === "fair"
      ? "var(--warning)"
      : "var(--expense)";
}

export function TierMedal({ tier, icon, unlocked, size = 48 }: { tier: Tier; icon: string; unlocked: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full ${unlocked ? "" : "grayscale"}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.48,
        background: `color-mix(in oklab, ${TIER_COLOR[tier]} ${unlocked ? 22 : 8}%, transparent)`,
        boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${TIER_COLOR[tier]} ${unlocked ? 75 : 22}%, transparent)`,
      }}
    >
      {icon}
    </span>
  );
}
