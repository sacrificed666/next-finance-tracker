import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { connectMono, deleteMono, loadMono, MonoError, publicMono } from "@/lib/server/monobank";
import { logError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

async function userId(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}

function monoFailure(err: unknown) {
  if (err instanceof MonoError) return NextResponse.json({ error: err.message }, { status: err.status });
  void logError("api/monobank", err);
  return NextResponse.json({ error: "unreachable" }, { status: 502 });
}

export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(publicMono(await loadMono(id)));
}

export async function POST(request: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token =
    typeof body.token === "string" && body.token.trim() ? body.token.trim() : (await loadMono(id))?.token;
  if (!token || !/^[\w-]{20,100}$/.test(token)) return NextResponse.json({ error: "token" }, { status: 400 });
  try {
    return NextResponse.json(publicMono(await connectMono(id, token)));
  } catch (err) {
    return monoFailure(err);
  }
}

export async function DELETE() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await deleteMono(id);
  return NextResponse.json({ ok: true });
}
