import { clearSession, getSession } from "./session";

export type RewardKind = "nth_free" | "cashback";

export type PublicUser = { id: string; visibleAddress: string; remoteAddress: string | null };

export type CardProgress = {
  rewardKind: RewardKind;
  stamps: number;
  target: number | null;
  redeemable: boolean;
  totalLuna: number;
  cashbackLuna: number;
};

export type PublicCard = {
  code: string;
  name: string;
  rewardKind: RewardKind;
  rewardText: string;
  targetVisits: number | null;
  cashbackBps: number | null;
  minLuna: number;
  receivingAddress: string;
  memo: string;
  active: boolean;
};

export type HeldCard = {
  code: string;
  name: string;
  rewardText: string;
  rewardKind: RewardKind;
  merchantName?: string;
  progress: CardProgress;
};

export type CardSummary = {
  code: string;
  name: string;
  rewardKind: RewardKind;
  rewardText: string;
  targetVisits: number | null;
  cashbackBps: number | null;
  minLuna: number;
  receivingAddress: string;
  active: boolean;
  stampCount: number;
  customerCount: number;
  createdAt: string;
};

export type Me = { user: PublicUser; owned: CardSummary[]; held: HeldCard[] };

export type StampRefusal =
  | "no memo"
  | "memo not vango"
  | "unknown card"
  | "card inactive"
  | "wrong recipient"
  | "below minimum"
  | "sender is merchant"
  | "already stamped"
  | "not included";

export type StampResult =
  | { stamped: true; stampId: string; cardCode: string; blockNumber: number }
  | { stamped: false; reason: StampRefusal };

export type ClaimResponse = { result: StampResult; progress?: CardProgress };

export type Challenge = { message: string; nonce: string; expiresAt: number };

export type SignedMessage = { message: string; publicKey: string; signature: string };

export type LoginBody = SignedMessage & {
  visibleAddress: string;
  remoteAddress?: string;
  language?: string;
  fiat?: string;
};

export type LoginResult = { token: string; user: PublicUser };

export type RewardOffer = {
  kind: RewardKind;
  text: string;
  stampsToConsume?: number;
  cashbackLuna?: number;
};

export type RedeemStart = {
  message: string;
  nonce: string;
  expiresAt: number;
  reward: RewardOffer;
};

export type RedeemSigned = {
  token: string;
  code6: string;
  expiresAt: string;
  reward: RewardOffer;
};

export type RedemptionView = {
  status: "pending" | "confirmed" | "cancelled";
  cardName: string;
  rewardText: string;
  rewardKind: RewardKind;
  customer: string;
  stampsConsumed: number;
  cashbackLuna: number;
  expiresAt: string | null;
};

export type ConfirmResult = {
  status: "confirmed";
  payTo?: string;
  amountLuna?: number;
  memo?: string;
};

export type CreateCardBody = {
  name: string;
  rewardKind: RewardKind;
  targetVisits?: number;
  cashbackBps?: number;
  minLuna?: number;
  rewardText: string;
};

/** Carries the body as well, because a 409 on a reward answers with the progress too. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** The progress a refusal came with, when it came with one. */
export function progressFromError(error: unknown): CardProgress | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  if (typeof body !== "object" || body === null || !("progress" in body)) return null;
  const progress = (body as { progress: unknown }).progress;
  return typeof progress === "object" && progress !== null ? (progress as CardProgress) : null;
}

/**
 * In the browser every call is same-origin and the Next rewrite forwards it, so the
 * WebView has one hostname to trust. A server render has no rewrite, so it talks to
 * the API directly.
 */
function baseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.API_ORIGIN ?? "http://localhost:8787";
}

type Options = { method?: "GET" | "POST" | "PATCH"; body?: unknown; auth?: boolean };

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  if (options.auth) {
    const session = getSession();
    if (!session) throw new ApiError(401, "Your wallet is not signed in yet.", null);
    headers.Authorization = `Bearer ${session.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: options.method ?? "GET",
      cache: "no-store",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiError(0, "Vango could not be reached. Check your connection and try again.", null);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && options.auth) clearSession();
    const message =
      typeof payload === "object" && payload !== null && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "Something went wrong. Try again.";
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

export function getChallenge(): Promise<Challenge> {
  return request("/api/auth/challenge", { method: "POST", body: {} });
}

export function verifyLogin(body: LoginBody): Promise<LoginResult> {
  return request("/api/auth/verify", { method: "POST", body });
}

export function getMe(): Promise<Me> {
  return request("/api/me", { auth: true });
}

export function getWallet(): Promise<{ held: HeldCard[] }> {
  return request("/api/wallet", { auth: true });
}

export function getCard(code: string): Promise<PublicCard> {
  return request(`/api/cards/${encodeURIComponent(code)}`);
}

export function createCard(body: CreateCardBody): Promise<CardSummary> {
  return request("/api/cards", { method: "POST", body, auth: true });
}

export function setCardActive(code: string, active: boolean): Promise<CardSummary> {
  return request(`/api/cards/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: { active },
    auth: true,
  });
}

export function claimStamp(hash: string): Promise<ClaimResponse> {
  return request("/api/stamps/claim", { method: "POST", body: { hash }, auth: true });
}

export function startRedeem(code: string): Promise<RedeemStart> {
  return request("/api/redeem/start", { method: "POST", body: { code }, auth: true });
}

export function signRedeem(body: SignedMessage): Promise<RedeemSigned> {
  return request("/api/redeem/sign", { method: "POST", body, auth: true });
}

export function viewRedemption(handle: string): Promise<RedemptionView> {
  return request(`/api/redeem/${encodeURIComponent(handle)}`, { auth: true });
}

export function confirmRedemption(handle: string): Promise<ConfirmResult> {
  return request(`/api/redeem/${encodeURIComponent(handle)}/confirm`, { method: "POST", body: {}, auth: true });
}

export function settleCashback(handle: string, hash: string): Promise<{ status: string; cashbackTxHash: string }> {
  return request(`/api/redeem/${encodeURIComponent(handle)}/paid`, {
    method: "POST",
    body: { hash },
    auth: true,
  });
}
