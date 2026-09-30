import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { loginOptions, registrationOptions } from "@/lib/server/passkeys";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { purpose?: unknown } | null;
  if (body?.purpose === "login") {
    if (!rateLimit(clientKey(request, "passkey-options"), 30, 15 * 60_000).allowed) {
      return NextResponse.json({ error: "wait" }, { status: 429 });
    }
    return NextResponse.json(await loginOptions());
  }
  if (body?.purpose === "register") {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    return NextResponse.json(await registrationOptions(id, session.user?.email ?? id, session.user?.name ?? ""));
  }
  return NextResponse.json({ error: "purpose" }, { status: 400 });
}
