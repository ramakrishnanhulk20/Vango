"use client";

import { useEffect, useRef, useState } from "react";
import StampCard from "@/components/hero/StampCard";
import {
  ApiError,
  claimStamp,
  type CardProgress,
  type ClaimResponse,
  type PublicCard,
  type StampRefusal,
} from "@/lib/api";
import { refusalText, shortHash } from "@/lib/cardText";
import { defaultAmountNim, formatNim, parseNimToLuna, progressLabel } from "@/lib/money";
import { isUserCancel, unwrap } from "@/lib/nimiq";
import { ensureSession } from "@/lib/session";
import { Arrow, Button, ButtonLink } from "./Button";
import { Pulse, useWallet } from "./ConnectGate";
import OpenInPay from "./OpenInPay";
import Perforation from "./Perforation";
import Reveal from "./Reveal";
import StampRow from "./StampRow";

const CLAIM_INTERVAL_MS = 2_000;
const CLAIM_WINDOW_MS = 60_000;

type Stage =
  | "idle"
  | "dialog"
  | "confirming"
  | "stamped"
  | "already"
  | "refused"
  | "cancelled"
  | "slow";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pay the shop, then watch the stamp land.
 *
 * The wallet hands back a hash the moment the customer confirms, but a hash is not
 * money yet: the server refuses it until the chain has it in a block. So the claim is
 * asked again every two seconds, and "not included" is a wait, never a refusal. After a
 * minute the watcher will pick the payment up on its own pass, and the screen says so
 * instead of pretending something broke.
 */
export default function PayPanel({ card, host }: { card: PublicCard; host: string }) {
  const { status, provider, me, reloadMe, retry } = useWallet();
  const [amount, setAmount] = useState(() => defaultAmountNim(card.minLuna));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [hash, setHash] = useState<string | null>(null);
  const [height, setHeight] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [fresh, setFresh] = useState<CardProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const runId = useRef(0);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  /**
   * One watcher at a time. A second tap gets nothing, and every watcher carries the id it
   * was started with, so a tick from an older one can never paint over a finished screen.
   */
  const startRun = (): number | null => {
    if (inFlight.current) return null;
    inFlight.current = true;
    runId.current += 1;
    setBusy(true);
    return runId.current;
  };

  const current = (run: number): boolean => alive.current && run === runId.current;

  const endRun = (run: number) => {
    if (run !== runId.current) return;
    inFlight.current = false;
    setBusy(false);
  };

  const held = me?.held.find((entry) => entry.code === card.code) ?? null;
  const progress = fresh ?? held?.progress ?? null;

  const follow = async (txHash: string, run: number) => {
    const deadline = Date.now() + CLAIM_WINDOW_MS;

    for (;;) {
      await sleep(CLAIM_INTERVAL_MS);
      if (!current(run)) return;

      let answer: ClaimResponse;
      try {
        answer = await claimStamp(txHash);
      } catch (thrown) {
        if (!current(run)) return;
        setMessage(
          thrown instanceof ApiError
            ? thrown.message
            : "Vango could not be reached. Your payment is on the chain either way.",
        );
        setStage("refused");
        endRun(run);
        return;
      }
      if (!current(run)) return;

      if (answer.result.stamped) {
        setHeight(answer.result.blockNumber);
        if (answer.progress) setFresh(answer.progress);
        setStage("stamped");
        endRun(run);
        void reloadMe();
        return;
      }

      const reason: StampRefusal = answer.result.reason;

      if (reason === "not included") {
        if (Date.now() > deadline) {
          setStage("slow");
          endRun(run);
          return;
        }
        continue;
      }

      if (reason === "already stamped") {
        const mine = await reloadMe();
        if (!current(run)) return;
        const entry = mine?.held.find((row) => row.code === card.code) ?? null;
        if (entry) setFresh(entry.progress);
        setStage("already");
        endRun(run);
        return;
      }

      setMessage(refusalText(reason));
      setStage("refused");
      endRun(run);
      return;
    }
  };

  const pay = async () => {
    if (inFlight.current) return;

    const luna = parseNimToLuna(amount);
    if (luna === null) {
      setAmountError("Type an amount in NIM, like 1.");
      return;
    }
    if (luna < card.minLuna) {
      setAmountError(`This shop counts a payment from ${formatNim(card.minLuna)} NIM.`);
      return;
    }
    setAmountError(null);
    if (!provider) return;

    const run = startRun();
    if (run === null) return;

    setMessage(null);
    setStage("dialog");

    let txHash: string;
    try {
      await ensureSession(provider);
      txHash = unwrap<string>(
        await provider.sendBasicTransactionWithData({
          recipient: card.receivingAddress,
          value: luna,
          data: card.memo,
        }),
      );
    } catch (thrown) {
      if (!current(run)) return;
      if (isUserCancel(thrown)) {
        setStage("cancelled");
        endRun(run);
        return;
      }
      setMessage(
        thrown instanceof Error ? thrown.message : "The wallet could not send that payment.",
      );
      setStage("refused");
      endRun(run);
      return;
    }
    if (!current(run)) return;

    setHash(txHash);
    setStage("confirming");
    await follow(txHash, run);
  };

  const checkAgain = () => {
    if (!hash) return;
    const run = startRun();
    if (run === null) return;
    void follow(hash, run);
  };

  /** Going back to the form retires the running watcher, so its next tick paints nothing. */
  const again = () => {
    runId.current += 1;
    inFlight.current = false;
    setBusy(false);
    setStage("idle");
    setMessage(null);
  };

  return (
    <div className="mt-auto pt-12">
      {(progress || status === "ready") && (
        <Reveal delay={0.24}>
          <ProgressStrip
            stamps={progress?.stamps ?? 0}
            target={progress?.target ?? card.targetVisits}
            cashbackLuna={progress?.cashbackLuna ?? 0}
          />
        </Reveal>
      )}

      <Reveal delay={0.3}>
        <div className="mt-7">
          {!card.active ? (
            <Line
              title="This card is paused"
              body="The shop has stopped collecting stamps on it for now."
            />
          ) : stage === "stamped" ? (
            <Stamped card={card} progress={progress} height={height} />
          ) : stage === "already" ? (
            <Done
              label="Already counted"
              title="That one is already on your card"
              body="The chain only counts a payment once, so nothing was lost."
              code={card.code}
              progress={progress}
            />
          ) : stage === "confirming" ? (
            <Working
              label="On the chain"
              title="Waiting for the chain"
              body="Your payment is out. The stamp lands as soon as it is in a block, usually a few seconds."
              hash={hash}
            />
          ) : stage === "dialog" ? (
            <Working
              label="Your wallet"
              title="Confirm in Nimiq Pay"
              body="Check the amount in the wallet dialog and confirm to collect your stamp."
              hash={null}
            />
          ) : stage === "slow" ? (
            <Slow hash={hash} onRetry={checkAgain} busy={busy} />
          ) : stage === "cancelled" ? (
            <Line
              title="Nothing was sent"
              body="You closed the wallet dialog, so no payment left your wallet."
              action={
                <Button onClick={again} disabled={busy}>
                  Try again
                </Button>
              }
            />
          ) : stage === "refused" ? (
            <Line
              title="No stamp on that one"
              body={message ?? "That payment did not match this card."}
              tone="bad"
              action={
                <Button onClick={again} disabled={busy}>
                  Try again
                </Button>
              }
            />
          ) : status === "boot" ? (
            <>
              <div className="outside-pay-only">
                <InPayOnly host={host} />
              </div>
              <div className="in-pay-only">
                <Waiting label="Waking your wallet" />
              </div>
            </>
          ) : status === "outside-pay" ? (
            <InPayOnly host={host} />
          ) : status === "syncing" || status === "waiting-provider" || status === "signing-in" ? (
            <Waiting
              label={status === "syncing" ? "Your wallet is syncing" : "Waking your wallet"}
            />
          ) : status === "cancelled" || status === "failed" ? (
            <Line
              title="Your wallet is not signed in"
              body="Vango needs one signature before it can put a stamp on your card."
              action={<Button onClick={retry}>Sign in</Button>}
            />
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void pay();
              }}
            >
              <label className="label-type block text-paper/45" htmlFor="amount">
                Amount to pay
              </label>
              <div className="mt-3 flex items-baseline gap-3 border-b border-line pb-3 focus-within:border-stamp">
                <input
                  id="amount"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setAmountError(null);
                  }}
                  inputMode="decimal"
                  autoComplete="off"
                  className="w-full min-w-0 bg-transparent font-mono text-[2.25rem] leading-none tracking-tight text-paper outline-none placeholder:text-paper/25"
                  placeholder={defaultAmountNim(card.minLuna)}
                />
                <span className="label-type shrink-0 text-paper/50">NIM</span>
              </div>
              {amountError && <p className="mt-3 text-sm text-bad/90">{amountError}</p>}
              <div className="mt-6">
                <Button tone="stamp" type="submit" disabled={busy}>
                  Pay and stamp
                  <Arrow />
                </Button>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-paper/45">
                Nimiq Pay asks you to confirm. Vango never touches your money.
              </p>
            </form>
          )}
        </div>
      </Reveal>
    </div>
  );
}

/** Where this wallet stands on this card. No stamps yet is a real answer, not a blank. */
function ProgressStrip({
  stamps,
  target,
  cashbackLuna,
}: {
  stamps: number;
  target: number | null;
  cashbackLuna: number;
}) {
  return (
    <div className="rounded-[8px] border border-line px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <span className="label-type text-paper/45">Your card</span>
        <span className="label-type text-paper/70">
          {target === null ? `${formatNim(cashbackLuna)} NIM back` : progressLabel(stamps, target)}
        </span>
      </div>
      {target !== null && (
        <div className="mt-3.5">
          <StampRow filled={Math.min(stamps, target)} slots={target} size="md" />
        </div>
      )}
    </div>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-line px-4 py-4">
      <Pulse />
      <span className="label-type text-paper/50">{label}</span>
    </div>
  );
}

function InPayOnly({ host }: { host: string }) {
  return (
    <div>
      <p className="mb-5 text-[0.9375rem] leading-relaxed text-paper/65">
        Open this card in Nimiq Pay to pay the shop and collect your stamp.
      </p>
      <OpenInPay host={host} />
    </div>
  );
}

function Line({
  title,
  body,
  action,
  tone = "quiet",
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  tone?: "quiet" | "bad";
}) {
  return (
    <div className="rounded-[8px] border border-line p-5">
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${tone === "bad" ? "bg-bad" : "bg-paper/35"}`}
        />
        <span className="label-type text-paper/50">{tone === "bad" ? "Not stamped" : "Nothing to do"}</span>
      </span>
      <p className="display-type mt-3 text-[1.5rem] leading-tight tracking-[-0.02em] text-paper">{title}</p>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-paper/65">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Working({
  label,
  title,
  body,
  hash,
}: {
  label: string;
  title: string;
  body: string;
  hash: string | null;
}) {
  return (
    <div className="rounded-[8px] border border-line p-5">
      <div className="flex items-center gap-3">
        <Pulse />
        <span className="label-type text-paper/50">{label}</span>
      </div>
      <p className="display-type mt-3 text-[1.5rem] leading-tight tracking-[-0.02em] text-paper">{title}</p>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-paper/65">{body}</p>
      {hash && (
        <>
          <Perforation className="mt-5 mb-3 text-paper" />
          <span className="label-type text-paper/40">Payment {shortHash(hash)}</span>
        </>
      )}
    </div>
  );
}

function Slow({
  hash,
  onRetry,
  busy,
}: {
  hash: string | null;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-[8px] border border-line p-5">
      <span className="label-type text-paper/50">Still landing</span>
      <p className="display-type mt-3 text-[1.5rem] leading-tight tracking-[-0.02em] text-paper">
        The chain is taking its time
      </p>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-paper/65">
        Your payment is out and nothing is lost. Vango keeps watching the chain, so the stamp will
        appear on this card on its own. Check again in a moment.
      </p>
      {hash && (
        <>
          <Perforation className="mt-5 mb-3 text-paper" />
          <span className="label-type text-paper/40">Payment {shortHash(hash)}</span>
        </>
      )}
      <div className="mt-5">
        <Button onClick={onRetry} disabled={busy}>
          Check again
        </Button>
      </div>
    </div>
  );
}

function Stamped({
  card,
  progress,
  height,
}: {
  card: PublicCard;
  progress: CardProgress | null;
  height: number;
}) {
  const target = progress?.target ?? null;
  const filled = target === null ? 0 : Math.min(progress?.stamps ?? 1, target);

  return (
    <div>
      <span className="flex items-center gap-2.5">
        <span aria-hidden className="h-2 w-2 rounded-full bg-stamp" />
        <span className="label-type text-stamp">Stamped</span>
      </span>
      <p
        className="display-type mt-4 text-paper"
        style={{ fontSize: "clamp(2rem, 10vw, 2.75rem)", letterSpacing: "-0.035em", lineHeight: 0.95 }}
      >
        {progress?.redeemable ? "Your card is full" : "That one is yours"}
      </p>

      {target !== null && height > 0 ? (
        <div className="mt-7 flex justify-center">
          <StampCard
            merchant={card.name}
            slots={target}
            stampIndex={Math.max(0, filled - 1)}
            blockNumber={height}
            entranceDelay={0.1}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-[8px] border border-line p-5">
          {target !== null && (
            <StampRow filled={filled} slots={target} size="md" />
          )}
          {target === null && progress && (
            <span className="font-mono text-2xl text-paper">
              {formatNim(progress.cashbackLuna)}
              <span className="ml-1.5 text-sm text-paper/55">NIM back</span>
            </span>
          )}
          {height > 0 && (
            <>
              <Perforation className="mt-5 mb-3 text-paper" />
              <span className="label-type text-paper/40">block {height}</span>
            </>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {progress?.redeemable && (
          <ButtonLink href={`/app/c/${card.code}/redeem`} tone="stamp">
            Take your {card.rewardText}
            <Arrow />
          </ButtonLink>
        )}
        <ButtonLink href="/app" tone="ghost">
          Back to your cards
        </ButtonLink>
      </div>
    </div>
  );
}

function Done({
  label,
  title,
  body,
  code,
  progress,
}: {
  label: string;
  title: string;
  body: string;
  code: string;
  progress: CardProgress | null;
}) {
  return (
    <div className="rounded-[8px] border border-line p-5">
      <span className="label-type text-paper/50">{label}</span>
      <p className="display-type mt-3 text-[1.5rem] leading-tight tracking-[-0.02em] text-paper">{title}</p>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-paper/65">{body}</p>
      {progress?.redeemable && (
        <div className="mt-5">
          <ButtonLink href={`/app/c/${code}/redeem`} tone="stamp">
            Take your reward
            <Arrow />
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
