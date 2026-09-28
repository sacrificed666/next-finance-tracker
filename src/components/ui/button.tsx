"use client";

import { useRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./icon";

type ButtonVariant = "primary" | "ghost" | "danger" | "plain";
type ButtonSize = "sm" | "md";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      "btn-gradient shadow-[0_2px_10px_rgba(4,20,32,0.18)] hover:-translate-y-px hover:brightness-[1.07] active:translate-y-0 active:scale-[0.97] disabled:opacity-40 disabled:hover:translate-y-0",
    ghost:
      "glass-el border border-hairline text-ink-1 hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] hover:bg-fill-hover hover:text-ink-1 active:scale-[0.97] disabled:opacity-40",
    danger:
      "border border-expense/25 bg-expense/12 text-expense shadow-[inset_0_1px_0_color-mix(in_oklab,var(--rim-light)_35%,transparent),inset_0_-1px_0_var(--under-edge)] hover:bg-expense/20 active:scale-[0.97] disabled:opacity-40",
    plain:
      "border border-transparent text-accent underline-offset-4 hover:border-hairline hover:bg-accent-soft hover:shadow-[inset_0_1px_0_color-mix(in_oklab,var(--rim-light)_30%,transparent)] active:scale-[0.97] disabled:opacity-40",
  };
  const lastFired = useRef(0);
  const guarded = onClick
    ? (e: MouseEvent<HTMLButtonElement>) => {
        const now = Date.now();
        if (now - lastFired.current < 400) return;
        lastFired.current = now;
        onClick(e);
      }
    : undefined;
  const sizing =
    size === "sm" ? "min-h-9 px-3 text-xs" : "min-h-10 px-4 py-2 text-sm";
  return (
    <button
      type="button"
      onClick={guarded}
      className={`btn-ring inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-[transform,background-color,border-color,box-shadow,filter] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-accent-soft disabled:cursor-not-allowed disabled:active:scale-100 ${sizing} ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function AddButton({
  label,
  onClick,
  variant = "ghost",
  disabled,
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  return (
    <Button variant={variant} onClick={onClick} disabled={disabled}>
      <Icon name="plus" size={14} strokeWidth={2.2} />
      {label}
    </Button>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="btn-gradient inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-md transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.97]"
    >
      {children}
    </Link>
  );
}
