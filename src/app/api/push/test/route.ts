import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { pushTo, testMessage } from "@/lib/server/push";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const id = (await auth())?.user?.id;
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const limit = rateLimit(clientKey(request, `push-test:${id}`), 5, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "wait" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof body.endpoint !== "string") return NextResponse.json({ error: "endpoint" }, { status: 400 });
  const result = await pushTo(id, await testMessage(id), body.endpoint);
  return result.sent > 0 ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "failed" }, { status: 502 });
}
