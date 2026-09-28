import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { loadAttachment } from "@/lib/server/attachments";

export const dynamic = "force-dynamic";

/** One receipt photo, only to the user who uploaded it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  if (!/^[\w-]{1,60}$/.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  const file = await loadAttachment(userId, id);
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
