import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { MonoError, publicMono, setMonoWebhook } from "@/lib/server/monobank";

export const dynamic = "force-dynamic";

/**
 * Turns automatic import on or off: `{ on: boolean }`. Monobank needs an address it
 * can reach, so this works only when AUTH_URL is the app's public https origin.
 */
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
    console.error("[api/monobank/webhook]", err);
    return NextResponse.json({ error: "unreachable" }, { status: 502 });
  }
}
