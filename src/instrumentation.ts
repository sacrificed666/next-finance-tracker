import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startReminderClock } = await import("./lib/reminder-clock");
    startReminderClock();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logError } = await import("./lib/error-log");
    const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
    await logError(`${request.method} ${context.routePath}`, err, digest);
  }
};
