"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui";

const MAX_SIDE = 1600;
const MAX_PHOTOS = 4;

async function shrink(file: File): Promise<{ mime: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/webp", 0.8),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mime: blob.type || "image/webp", data: btoa(binary) };
}

export function ReceiptPhotos({
  value,
  onChange,
  labels,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  labels: { add: string; remove: string; open: string; uploading: string; failed: string };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(false);
    const added: string[] = [];
    try {
      for (const file of [...files].slice(0, MAX_PHOTOS - value.length)) {
        const body = await shrink(file);
        const res = await fetch("/api/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(String(res.status));
        const { id } = (await res.json()) as { id: string };
        added.push(id);
      }
    } catch {
      setError(true);
    } finally {
      if (added.length > 0) onChange([...value, ...added]);
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((id) => (
          <span key={id} className="relative">
            <a
              href={`/api/attachments/${id}`}
              target="_blank"
              rel="noreferrer"
              aria-label={labels.open}
              className="block size-16 overflow-hidden rounded-field border border-hairline bg-ghost"
            >
              <img src={`/api/attachments/${id}`} alt="" className="size-full object-cover" />
            </a>
            <button
              type="button"
              aria-label={labels.remove}
              onClick={() => onChange(value.filter((v) => v !== id))}
              className="icon-btn glass-strong absolute -right-1.5 -top-1.5 size-6 text-ink-2"
            >
              <Icon name="close" size={11} strokeWidth={2.6} />
            </button>
          </span>
        ))}
        {value.length < MAX_PHOTOS && (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex size-16 flex-col items-center justify-center gap-1 rounded-field border border-dashed border-hairline text-[11px] font-medium text-ink-3 transition-colors hover:bg-fill-hover hover:text-ink-1 disabled:opacity-50"
          >
            <Icon name={busy ? "refresh" : "plus"} size={16} className={busy ? "animate-spin" : ""} />
            {busy ? labels.uploading : labels.add}
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-expense">{labels.failed}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
    </div>
  );
}
