/**
 * The signed reward, kept on the phone until the counter confirms it.
 *
 * It lives in localStorage because the customer can lock the screen or drop the app
 * while walking to the till, and the server will not sign a second one for the same
 * card until the first has expired. The baseline is what the card stood at when the
 * signature was made, which is how the app knows the reward was taken: the progress
 * drops below it.
 */
export type RedeemTicket = {
  token: string;
  code6: string;
  expiresAt: string;
  rewardText: string;
  baselineStamps: number;
  baselineCashbackLuna: number;
};

function key(code: string): string {
  return `vango.redeem.${code}`;
}

export function readTicket(code: string): RedeemTicket | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key(code));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const ticket = parsed as Partial<RedeemTicket>;
    if (typeof ticket.token !== "string" || typeof ticket.code6 !== "string") return null;
    if (typeof ticket.expiresAt !== "string") return null;
    return {
      token: ticket.token,
      code6: ticket.code6,
      expiresAt: ticket.expiresAt,
      rewardText: typeof ticket.rewardText === "string" ? ticket.rewardText : "",
      baselineStamps: typeof ticket.baselineStamps === "number" ? ticket.baselineStamps : 0,
      baselineCashbackLuna:
        typeof ticket.baselineCashbackLuna === "number" ? ticket.baselineCashbackLuna : 0,
    };
  } catch {
    return null;
  }
}

export function writeTicket(code: string, ticket: RedeemTicket): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(code), JSON.stringify(ticket));
}

export function forgetTicket(code: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(code));
}

export function ticketIsLive(ticket: RedeemTicket, now = Date.now()): boolean {
  const expires = Date.parse(ticket.expiresAt);
  return Number.isFinite(expires) && expires > now;
}
