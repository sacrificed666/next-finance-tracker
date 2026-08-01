import { NextResponse } from "next/server";
import { loadState, saveState, StateConflictError } from "@/lib/repo";

// always hit Postgres — never prerender or cache this endpoint
export const dynamic = "force-dynamic";

function fail(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : "Unexpected database error";
  console.error("[api/state]", err);
  return NextResponse.json({ error: message }, { status });
}

/**
 * The revision is an opaque token internally, but on the wire it is an ETag,
 * which the spec says is a quoted string (optionally weak). Emitting a bare
 * token works in practice and then stops working behind the reverse proxy the
 * README recommends, so quote it here and unquote whatever comes back.
 */
function toEtag(revision: string): string {
  return JSON.stringify(revision);
}

function fromIfMatch(header: string | null): string | null {
  if (header === null) return null;
  const value = header.trim();
  // `*` means "as long as something is there" — no revision to compare against
  if (value === "*") return null;
  const unquoted = value.replace(/^W\//, "").replace(/^"(.*)"$/, "$1");
  return unquoted;
}

/**
 * GET /api/state — the whole dataset assembled from the normalized tables.
 * The revision it was read at rides along in `ETag`, and a write has to hand it
 * back so a stale tab cannot overwrite newer data (see PUT).
 */
export async function GET() {
  try {
    const { state, revision } = await loadState();
    return NextResponse.json(state, { headers: { ETag: toEtag(revision) } });
  } catch (err) {
    return fail(err);
  }
}

/**
 * PUT /api/state — replaces the dataset (validated server-side before writing).
 *
 * `If-Match` carries the revision the client is overwriting. Without it the
 * write is unconditional, which is what a script restoring a backup wants; the
 * app always sends one, so a second tab holding an older snapshot is refused
 * with 409 instead of quietly deleting everything saved since it loaded.
 */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }
  try {
    // saveState runs the payload through normalizeState, so malformed rows are
    // dropped rather than written
    const expected = fromIfMatch(request.headers.get("if-match"));
    const revision = await saveState(body as never, expected);
    return NextResponse.json({ ok: true, revision }, { headers: { ETag: toEtag(revision) } });
  } catch (err) {
    if (err instanceof StateConflictError) {
      // an ordinary outcome of two tabs, not a fault — a stack trace here would
      // train whoever reads the logs to ignore the ones that do matter
      console.warn("[api/state] refused a stale write");
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return fail(err);
  }
}
