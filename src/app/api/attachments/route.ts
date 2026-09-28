import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, saveAttachment } from "@/lib/server/attachments";
import { rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/** Upload one receipt photo: `{ mime, data }` with the image as base64. */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!rateLimit(`attach:${userId}`, 30, 60_000).allowed) {
    return NextResponse.json({ error: "Too many uploads — wait a minute." }, { status: 429 });
  }

  let body: { mime?: unknown; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }
  const mime = typeof body.mime === "string" ? body.mime : "";
  if (!ATTACHMENT_TYPES.has(mime) || typeof body.data !== "string") {
    return NextResponse.json({ error: "Send a WebP, JPEG or PNG image." }, { status: 400 });
  }
  const data = Buffer.from(body.data, "base64");
  if (data.length === 0 || data.length > ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: "The image is empty or too large." }, { status: 413 });
  }
  const id = await saveAttachment(userId, mime, data);
  return NextResponse.json({ id });
}
