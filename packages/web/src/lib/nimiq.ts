import type { ErrorResponse, NimiqProvider, SignatureResult } from "@nimiq/mini-app-sdk/provider";

export type { NimiqProvider, SignatureResult };

declare global {
  interface Window {
    nimiq?: NimiqProvider;
    nimiqPay?: { language?: string; userFiat?: string };
  }
}

const POLL_MS = 50;

/**
 * Waits for Nimiq Pay to hand the page its wallet.
 *
 * The SDK ships an init() that does exactly this, but the spike proved a CDN module
 * import dies inside the Pay WebView and takes the whole page with it, so the poll is
 * written out here and only the SDK's types are imported.
 */
export function waitForProvider(timeoutMs: number): Promise<NimiqProvider> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (typeof window !== "undefined" && window.nimiq) return resolve(window.nimiq);
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("The wallet did not answer."));
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
  });
}

/** True when the page is running inside Nimiq Pay, which seeds this before our scripts. */
export function isInsidePay(): boolean {
  return typeof window !== "undefined" && window.nimiqPay !== undefined;
}

export function hostLanguage(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.nimiqPay?.language;
}

export function hostFiat(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.nimiqPay?.userFiat;
}

type MaybeError = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  error?: { type?: unknown; message?: unknown };
};

/**
 * A tap on Cancel in the native dialog. The phone throws a plain
 * Error("User rejected the request."), so the message is the only thing to go on;
 * older builds answered with a PermissionDenied payload instead, which is the same
 * thing happening and is matched here too.
 */
export function isUserCancel(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const shape = error as MaybeError;
  if (shape.code === 4001) return true;
  const words = [shape.name, shape.message, shape.error?.type, shape.error?.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return /reject|denied|permissiondenied|cancel/i.test(words);
}

/**
 * The provider can fail two ways: it throws, or it resolves an object carrying an
 * error. Both have to come out of here as a throw, or a refusal reads as a success.
 */
export function unwrap<T>(value: T | ErrorResponse): T {
  if (typeof value === "object" && value !== null && "error" in value) {
    const payload = (value as ErrorResponse).error;
    const thrown = new Error(`${payload?.type ?? "Error"}: ${payload?.message ?? "the wallet refused"}`);
    throw thrown;
  }
  return value as T;
}

/** The wallet's two addresses: the one the customer sees, and the one that pays. */
export type WalletAccounts = { visibleAddress: string; remoteAddress?: string };

export async function readAccounts(provider: NimiqProvider): Promise<WalletAccounts> {
  const accounts = unwrap<string[]>(await provider.listAccounts());
  const visibleAddress = accounts[0];
  if (!visibleAddress) throw new Error("This wallet has no address yet.");
  const remoteAddress = accounts[1];
  return remoteAddress === undefined ? { visibleAddress } : { visibleAddress, remoteAddress };
}
