"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

const MARGIN = 2;

/**
 * The QR the counter scans, drawn as one SVG path so it stays crisp at any size and
 * needs no canvas, no image and no network. Ink on paper, because a scanner expects
 * dark modules on a light field.
 */
export default function QrCode({ text, className = "" }: { text: string; className?: string }) {
  const drawn = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = "";
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.isDark(row, column)) {
          path += `M${column + MARGIN} ${row + MARGIN}h1v1h-1z`;
        }
      }
    }
    return { path, size: count + MARGIN * 2 };
  }, [text]);

  return (
    <svg
      viewBox={`0 0 ${drawn.size} ${drawn.size}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Reward code for the counter to scan"
    >
      <path d={drawn.path} fill="var(--ink)" />
    </svg>
  );
}
