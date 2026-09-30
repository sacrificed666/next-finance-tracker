import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { MonoError, publicMono, setMonoWebhook } from "@/lib/server/monobank";
import { logError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { on?: unknown };
  const on = body.on === true;
  const origin = process.env.AUTH_URL ?? "";
  if (on && !origin.startsWith("https://")) return NextResponse.json({ error: "https" }, { status: 400 });
  try {
    return NextResponse.json(publicMono(await setMonoWebhook(userId, on ? origin : null)));
  } catch (err) {
    if (err instanceof MonoError) return NextResponse.json({ error: err.message }, { status: err.status });
    await logError("api/monobank/webhook", err);
    return NextResponse.json({ error: "unreachable" }, { status: 502 });
  }
}
