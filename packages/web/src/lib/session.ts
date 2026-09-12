import { getChallenge, verifyLogin } from "./api";
import {
  hostFiat,
  hostLanguage,
  readAccounts,
  unwrap,
  type NimiqProvider,
  type SignatureResult,
} from "./nimiq";

const KEY = "vango.session";

export type Session = { token: string; visibleAddress: string };

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { token, visibleAddress } = parsed as Partial<Session>;
    if (typeof token !== "string" || typeof visibleAddress !== "string") return null;
    return { token, visibleAddress };
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/**
 * Signs the wallet in, or returns the session it already has. One native dialog, and
 * only when there is no token yet.
 *
 * Both addresses go to the server: the visible one is what the signature proves, and
 * the remote one is what actually pays, so stamps that landed from it before this
 * wallet ever opened Vango are handed over on the way in.
 */
export async function ensureSession(provider: NimiqProvider): Promise<Session> {
  const existing = getSession();
  if (existing) return existing;

  const accounts = await readAccounts(provider);
  const challenge = await getChallenge();
  const signed = unwrap<SignatureResult>(await provider.sign(challenge.message));

  const language = hostLanguage();
  const fiat = hostFiat();

  const result = await verifyLogin({
    message: challenge.message,
    publicKey: signed.publicKey,
    signature: signed.signature,
    visibleAddress: accounts.visibleAddress,
    ...(accounts.remoteAddress === undefined ? {} : { remoteAddress: accounts.remoteAddress }),
    ...(language === undefined ? {} : { language }),
    ...(fiat === undefined ? {} : { fiat }),
  });

  const session = { token: result.token, visibleAddress: result.user.visibleAddress };
  setSession(session);
  return session;
}
