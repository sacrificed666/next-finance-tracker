import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { pushKey, REMINDER_HOUR, removeDevice, saveDevice } from "@/lib/server/push";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await auth())?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ key: pushKey(), hour: REMINDER_HOUR });
}

export async function PUT(request: Request) {
  const id = (await auth())?.user?.id;
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { subscription?: unknown };
  return (await saveDevice(id, body.subscription))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "subscription" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const id = (await auth())?.user?.id;
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof body.endpoint !== "string") return NextResponse.json({ error: "endpoint" }, { status: 400 });
  await removeDevice(id, body.endpoint);
  return NextResponse.json({ ok: true });
}
