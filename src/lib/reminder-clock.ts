import { createHmac } from "node:crypto";

const EVERY_MS = 15 * 60_000;

export function remindToken(secret: string): string {
  return createHmac("sha256", secret).update("finance-tracker:push-remind").digest("base64url");
}

export function startReminderClock(): void {
  const secret = process.env.AUTH_SECRET?.trim();
  const clock = globalThis as { __financeReminderClock?: ReturnType<typeof setInterval> };
  if (!secret || clock.__financeReminderClock || process.env.REMINDERS === "off") return;
  const url = `http://127.0.0.1:${process.env.PORT || "3000"}/api/push/remind`;
  const tick = () => {
    void fetch(url, { method: "POST", headers: { "x-remind-token": remindToken(secret) } }).catch(() => {});
  };
  clock.__financeReminderClock = setInterval(tick, EVERY_MS);
  clock.__financeReminderClock.unref?.();
  setTimeout(tick, 60_000).unref?.();
}
