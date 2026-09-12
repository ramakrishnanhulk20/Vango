import type { Html5Qrcode } from "html5-qrcode";

const FPS = 10;
const BOX_PX = 220;

export type CameraCheck = { ok: true } | { ok: false; hint: string };

/**
 * Why the camera cannot open, in words a shop owner can act on. A phone browser only
 * hands over a camera on https, and a desktop tab often has none at all, so both cases
 * end at the six-digit box instead of a dead button.
 */
export function cameraCheck(): CameraCheck {
  if (typeof window === "undefined") return { ok: false, hint: "" };

  if (!window.isSecureContext) {
    return {
      ok: false,
      hint: "This page is not on a secure connection, so the phone will not open the camera. Open Vango from Nimiq Pay, or type the six digits below.",
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      hint: "This device did not offer Vango a camera. Ask the customer for their six digits and type them below.",
    };
  }

  return { ok: true };
}

let running: Html5Qrcode | null = null;

/**
 * Opens the back camera inside the given element and calls back on the first code it
 * reads. The library is pulled in here rather than at the top of the file because it
 * touches the DOM as it loads, which a server render cannot carry.
 *
 * Decode misses fire many times a second while the camera hunts for a code, so they are
 * swallowed: only a real read reaches the caller.
 */
export async function start(elementId: string, onDecoded: (text: string) => void): Promise<void> {
  const check = cameraCheck();
  if (!check.ok) throw new Error(check.hint);

  await stop();

  const { Html5Qrcode } = await import("html5-qrcode");
  const scanner = new Html5Qrcode(elementId, { verbose: false });
  running = scanner;

  await scanner.start(
    { facingMode: "environment" },
    { fps: FPS, qrbox: BOX_PX },
    (text) => onDecoded(text),
    () => {},
  );
}

export async function stop(): Promise<void> {
  const scanner = running;
  if (!scanner) return;
  running = null;
  try {
    await scanner.stop();
  } catch {
    return;
  }
  scanner.clear();
}

/**
 * What the counter actually scanned or typed, turned into the handle the API takes.
 * The QR carries a prefixed token; a customer reading digits down the counter gives
 * six of them.
 */
export function readHandle(text: string): string | null {
  const trimmed = text.trim();
  const token = trimmed.startsWith("vango-redeem:") ? trimmed.slice("vango-redeem:".length) : trimmed;
  if (/^vr1\.[0-9a-f]{32}$/.test(token)) return token;
  if (/^\d{6}$/.test(token)) return token;
  return null;
}
