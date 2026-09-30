import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { recentSignIns } from "@/lib/server/sign-ins";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ current: session.signInId ?? null, entries: await recentSignIns(id) });
}
