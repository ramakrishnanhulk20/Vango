import type { PublicCard, StampRefusal } from "./api";
import { formatNim } from "./money";

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  const ones = value % 10;
  if (ones === 1) return `${value}st`;
  if (ones === 2) return `${value}nd`;
  if (ones === 3) return `${value}rd`;
  return `${value}th`;
}

type Rule = Pick<PublicCard, "rewardKind" | "rewardText" | "targetVisits" | "cashbackBps">;

/** The card's promise in one line, the way it would be written on a paper card. */
export function ruleText(card: Rule): string {
  if (card.rewardKind === "nth_free" && card.targetVisits !== null) {
    return `Every ${ordinal(card.targetVisits)} visit is on the house`;
  }
  if (card.rewardKind === "cashback" && card.cashbackBps !== null) {
    const percent = card.cashbackBps / 100;
    return `${String(percent).replace(/\.0+$/, "")}% back in NIM`;
  }
  return card.rewardText;
}

export function minimumText(minLuna: number): string {
  return `Counts from ${formatNim(minLuna)} NIM`;
}

/**
 * Why a payment did not become a stamp, in words a customer can act on. Every one of
 * these comes back from the server as a rule name, never as a message for a person.
 */
const refusals: Record<StampRefusal, string> = {
  "no memo": "That payment went out without the card note, so the shop could not tell it apart. Pay from this page and the note goes with it.",
  "memo not vango": "That payment carried a note for something else. Pay from this page so it lands on this card.",
  "unknown card": "This card is not open any more. Ask the shop for their current one.",
  "card inactive": "The shop has paused this card, so it is not collecting stamps right now.",
  "wrong recipient": "That payment went to a different address, so it did not land on this card.",
  "below minimum": "That was less than the shop counts, so no stamp. Pay the amount shown and try again.",
  "sender is merchant": "This is the shop's own wallet. A shop cannot collect its own stamps.",
  "already stamped": "That payment is already on your card.",
  "not included": "The chain has not confirmed that payment yet.",
};

export function refusalText(reason: StampRefusal): string {
  return refusals[reason];
}

/** Enough of a hash to recognise it, which is all a customer ever needs from one. */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}
