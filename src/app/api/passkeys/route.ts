import { NextResponse } from "next/server";
import { deviceLabel } from "@/lib/device";
import { auth } from "@/lib/server/auth";
import { finishRegistration, listPasskeys, removePasskey } from "@/lib/server/passkeys";

export const dynamic = "force-dynamic";

async function userId(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}

export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ passkeys: await listPasskeys(id) });
}

export async function POST(request: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { response?: unknown } | null;
  if (!body?.response || typeof body.response !== "object") return NextResponse.json({ error: "response" }, { status: 400 });
  const name = deviceLabel(request.headers.get("user-agent"));
  const saved = await finishRegistration(id, body.response as Parameters<typeof finishRegistration>[1], name);
  return saved ? NextResponse.json({ passkeys: await listPasskeys(id) }) : NextResponse.json({ error: "verify" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string") return NextResponse.json({ error: "id" }, { status: 400 });
  await removePasskey(id, body.id);
  return NextResponse.json({ passkeys: await listPasskeys(id) });
}
