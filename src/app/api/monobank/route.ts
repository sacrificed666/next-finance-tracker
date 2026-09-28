import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { connectMono, deleteMono, loadMono, MonoError, publicMono } from "@/lib/server/monobank";

export const dynamic = "force-dynamic";

async function userId(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}

function monoFailure(err: unknown) {
  if (err instanceof MonoError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("[api/monobank]", err);
  return NextResponse.json({ error: "unreachable" }, { status: 502 });
}

/** Whether Monobank is connected, as whom, and which accounts it has. */
export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(publicMono(await loadMono(id)));
}

/** Connect with a personal token (`{ token }`), or refresh the account list with an empty body. */
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

/** Forget the token. */
export async function DELETE() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await deleteMono(id);
  return NextResponse.json({ ok: true });
}
