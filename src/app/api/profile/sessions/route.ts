import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { endAllSessions } from "@/lib/server/sessions";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const id = (await auth())?.user?.id;
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await endAllSessions(id);
  return NextResponse.json({ ok: true });
}
