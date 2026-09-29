import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { beginTwoFactor, confirmTwoFactor, disableTwoFactor } from "@/lib/server/two-factor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; code?: unknown };
  const code = typeof body.code === "string" ? body.code : "";

  if (body.action === "begin") {
    const started = await beginTwoFactor(id, session.user?.email ?? "account");
    return started ? NextResponse.json(started) : NextResponse.json({ error: "enabled" }, { status: 409 });
  }

  const limit = rateLimit(clientKey(request, `two-factor:${id}`), 10, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "wait" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (body.action === "confirm") {
    const recovery = await confirmTwoFactor(id, code);
    return recovery ? NextResponse.json({ recovery }) : NextResponse.json({ error: "code" }, { status: 400 });
  }

  if (body.action === "disable") {
    return (await disableTwoFactor(id, code))
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "code" }, { status: 400 });
  }

  return NextResponse.json({ error: "action" }, { status: 400 });
}
