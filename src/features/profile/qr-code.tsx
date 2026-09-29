"use client";

import qrcode from "qrcode-generator";

export function QrCode({ value, label, size = 176 }: { value: string; label: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 2;
  const cells: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) cells.push(`M${col + quiet} ${row + quiet}h1v1h-1z`);
    }
  }
  const side = count + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${side} ${side}`}
      shapeRendering="crispEdges"
      className="rounded-field bg-white"
    >
      <path d={cells.join("")} fill="#07130c" />
    </svg>
  );
}
