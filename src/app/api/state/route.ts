import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth, OWNER_EMAIL } from "@/lib/server/auth";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { claimOrphanData, loadState, saveChanges, stateRevision } from "@/lib/server/repo";
import { parseChanges } from "@/lib/state/changes";

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

/** Only the revision: lets an open tab ask "did another device save?" without loading everything. */
export async function HEAD() {
  const userId = await currentUserId();
  if (!userId) return new NextResponse(null, { status: 401 });
  try {
    return new NextResponse(null, { headers: { ETag: toEtag(await stateRevision(userId)) } });
  } catch (err) {
    console.error("[api/state]", err);
    return new NextResponse(null, { status: 500 });
  }
}

/**
 * Saves a set of changes: `{ base, changes }`, where `base` is the revision the
 * client last saw. Changes merge into whatever is stored; `stale` in the answer
 * tells the client that another device saved in between and it should pull.
 */
export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const changes = parseChanges(record?.changes);
  if (!record || !changes) {
    return NextResponse.json({ error: "Expected { base, changes }" }, { status: 400 });
  }
  const base = typeof record.base === "string" && record.base !== "" ? record.base : null;
  try {
    const preferred = (await cookies()).get(LOCALE_COOKIE)?.value;
    const result = await saveChanges(userId, changes, base, isLocale(preferred) ? preferred : DEFAULT_LOCALE);
    return NextResponse.json(result, { headers: { ETag: toEtag(result.revision) } });
  } catch (err) {
    return fail(err);
  }
}
