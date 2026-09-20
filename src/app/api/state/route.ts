import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth, OWNER_EMAIL } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { claimOrphanData, loadState, saveState, StateConflictError } from "@/lib/repo";

export const dynamic = "force-dynamic";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  if (OWNER_EMAIL && session.user?.email?.toLowerCase() === OWNER_EMAIL) {
    await claimOrphanData(id);
  }
  return id;
}

function unauthorized() {
  return NextResponse.json({ error: "Sign in to load your data." }, { status: 401 });
}

function fail(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : "Unexpected database error";
  console.error("[api/state]", err);
  return NextResponse.json({ error: message }, { status });
}

function toEtag(revision: string): string {
  return JSON.stringify(revision);
}

function fromIfMatch(header: string | null): string | null {
  if (header === null) return null;
  const value = header.trim();
  if (value === "*") return null;
  const unquoted = value.replace(/^W\//, "").replace(/^"(.*)"$/, "$1");
  return unquoted;
}

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();
    const preferred = (await cookies()).get(LOCALE_COOKIE)?.value;
    const { state, revision } = await loadState(
      userId,
      isLocale(preferred) ? preferred : DEFAULT_LOCALE,
    );
    return NextResponse.json(state, { headers: { ETag: toEtag(revision) } });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }
  try {
    const expected = fromIfMatch(request.headers.get("if-match"));
    const revision = await saveState(userId, body as never, expected);
    return NextResponse.json({ ok: true, revision }, { headers: { ETag: toEtag(revision) } });
  } catch (err) {
    if (err instanceof StateConflictError) {
      console.warn("[api/state] refused a stale write");
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return fail(err);
  }
}
