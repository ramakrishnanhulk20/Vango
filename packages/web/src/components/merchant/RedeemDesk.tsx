"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Arrow, Button, ButtonLink } from "@/components/app/Button";
import { Pulse, useWallet } from "@/components/app/ConnectGate";
import Perforation from "@/components/app/Perforation";
import Reveal from "@/components/app/Reveal";
import {
  ApiError,
  confirmRedemption,
  settleCashback,
  viewRedemption,
  type ConfirmResult,
  type RedemptionView,
} from "@/lib/api";
import { shortHash } from "@/lib/cardText";
import { formatNim } from "@/lib/money";
import { isUserCancel, unwrap } from "@/lib/nimiq";
import { cameraCheck, readHandle, start, stop } from "@/lib/scanner";

const STAGE_ID = "vango-scan-stage";
const CLOCK_MS = 1_000;
const SETTLE_INTERVAL_MS = 2_000;
const SETTLE_WINDOW_MS = 90_000;

type Phase =
  | "idle"
  | "camera"
  | "looking"
  | "reward"
  | "confirming"
  | "given"
  | "owed"
  | "dialog"
  | "settling"
  | "settled"
  | "slow"
  | "unsettled"
  | "gone"
  | "failed";

/** The refusals that only mean the payment has not reached a block yet. */
function stillWaiting(error: ApiError): boolean {
  return error.status === 409 && /not in a block yet|no such payment on chain/i.test(error.message);
}

/** The API's status word, said the way the counter would say it. */
function statusWords(status: RedemptionView["status"]): string {
  if (status === "pending") return "Not given yet";
  if (status === "confirmed") return "Already given";
  return "Ran out";
}

function countdown(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The counter's side of a reward: read the customer's code, see what it is worth, hand
 * it over. Cashback also costs the shop a payment, so that one ends at a wallet dialog
 * and the server reads the payment back off the chain before it calls the reward settled.
 */
export default function RedeemDesk() {
  const { provider } = useWallet();
  const reduced = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState("");
  const [handle, setHandle] = useState<string | null>(null);
  const [reward, setReward] = useState<RedemptionView | null>(null);
  const [owed, setOwed] = useState<ConfirmResult | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const inFlight = useRef(false);
  const runId = useRef(0);

  /**
   * One confirm or settle at a time. A second tap gets nothing, and each run carries the
   * id it started with, so a late answer from an older run cannot paint over the screen
   * the counter is looking at now.
   */
  const startRun = useCallback((): number | null => {
    if (inFlight.current) return null;
    inFlight.current = true;
    runId.current += 1;
    setWorking(true);
    return runId.current;
  }, []);

  const current = useCallback(
    (run: number): boolean => alive.current && run === runId.current,
    [],
  );

  const endRun = useCallback((run: number) => {
    if (run !== runId.current) return;
    inFlight.current = false;
    setWorking(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    const check = cameraCheck();
    if (!check.ok && check.hint) setHint(check.hint);
    return () => {
      alive.current = false;
      void stop();
    };
  }, []);

  const lookUp = useCallback(async (found: string) => {
    setMessage(null);
    setHandle(found);
    setPhase("looking");

    try {
      const view = await viewRedemption(found);
      if (!alive.current) return;
      setReward(view);
      if (view.status === "pending") {
        setRemaining(view.expiresAt ? Math.max(0, Date.parse(view.expiresAt) - Date.now()) : 0);
        setPhase("reward");
        return;
      }
      setPhase("gone");
    } catch (thrown) {
      if (!alive.current) return;
      if (thrown instanceof ApiError && thrown.status === 404) {
        setMessage("No reward with that code for your cards. Codes last ten minutes.");
        setPhase("idle");
        return;
      }
      setMessage(
        thrown instanceof ApiError ? thrown.message : "Vango could not be reached. Check the connection.",
      );
      setPhase("failed");
    }
  }, []);

  const openCamera = async () => {
    setMessage(null);
    setPhase("camera");
    busy.current = false;

    try {
      await start(STAGE_ID, (text) => {
        if (busy.current) return;
        const found = readHandle(text);
        if (!found) {
          setMessage("That code is not a Vango reward. Point at the code on the customer's phone.");
          return;
        }
        busy.current = true;
        void stop().then(() => lookUp(found));
      });
    } catch (thrown) {
      if (!alive.current) return;
      const why = thrown instanceof Error ? thrown.message : typeof thrown === "string" ? thrown : "";
      setHint(
        `The camera did not open${why ? `: ${why}` : ""}. Ask the customer for their six digits and type them below.`,
      );
      setPhase("idle");
    }
  };

  const closeCamera = async () => {
    await stop();
    if (!alive.current) return;
    setPhase("idle");
  };

  const settle = useCallback(
    async (paidHash: string, existing?: number) => {
      if (!handle) return;
      const run = existing ?? startRun();
      if (run === null) return;
      const deadline = Date.now() + SETTLE_WINDOW_MS;
      setMessage(null);
      setPhase("settling");

      for (;;) {
        await sleep(SETTLE_INTERVAL_MS);
        if (!current(run)) return;

        try {
          await settleCashback(handle, paidHash);
          if (!current(run)) return;
          setPhase("settled");
          endRun(run);
          return;
        } catch (thrown) {
          if (!current(run)) return;
          if (thrown instanceof ApiError && stillWaiting(thrown)) {
            if (Date.now() < deadline) continue;
            setPhase("slow");
            endRun(run);
            return;
          }
          setMessage(
            thrown instanceof ApiError
              ? thrown.message
              : "Vango could not be reached. Your payment is on the chain either way.",
          );
          setPhase("unsettled");
          endRun(run);
          return;
        }
      }
    },
    [current, endRun, handle, startRun],
  );

  const confirm = async () => {
    if (!handle) return;
    const run = startRun();
    if (run === null) return;
    setMessage(null);
    setPhase("confirming");

    try {
      const result = await confirmRedemption(handle);
      if (!current(run)) return;
      if (reward?.rewardKind === "cashback") {
        if (!result.payTo || result.amountLuna === undefined || !result.memo) {
          setMessage("The server did not say where to pay. Try confirming again.");
          setPhase("failed");
          endRun(run);
          return;
        }
        setOwed(result);
        setPhase("owed");
        endRun(run);
        return;
      }
      setPhase("given");
      endRun(run);
    } catch (thrown) {
      if (!current(run)) return;
      if (thrown instanceof ApiError && (thrown.status === 409 || thrown.status === 404)) {
        setMessage(thrown.message);
        setPhase("gone");
        endRun(run);
        return;
      }
      setMessage(thrown instanceof ApiError ? thrown.message : "That did not go through. Try again.");
      setPhase("failed");
      endRun(run);
    }
  };

  const pay = async () => {
    if (!provider || !owed?.payTo || owed.amountLuna === undefined || !owed.memo) return;
    const run = startRun();
    if (run === null) return;
    setMessage(null);
    setPhase("dialog");

    let paidHash: string;
    try {
      paidHash = unwrap<string>(
        await provider.sendBasicTransactionWithData({
          recipient: owed.payTo,
          value: owed.amountLuna,
          data: owed.memo,
        }),
      );
    } catch (thrown) {
      if (!current(run)) return;
      if (isUserCancel(thrown)) {
        setMessage("Nothing left your wallet. The reward is still accepted, so you can pay it now.");
        setPhase("owed");
        endRun(run);
        return;
      }
      setMessage(thrown instanceof Error ? thrown.message : "The wallet could not send that payment.");
      setPhase("owed");
      endRun(run);
      return;
    }
    if (!current(run)) return;

    setHash(paidHash);
    await settle(paidHash, run);
  };

  /** Starting over retires the running loop, so its next answer paints nothing. */
  const again = () => {
    runId.current += 1;
    inFlight.current = false;
    setWorking(false);
    setMessage(null);
    setHandle(null);
    setReward(null);
    setOwed(null);
    setHash(null);
    setTyped("");
    setPhase("idle");
  };

  useEffect(() => {
    if (phase !== "reward" || !reward?.expiresAt) return;
    const expires = Date.parse(reward.expiresAt);

    const tick = () => {
      const left = Math.max(0, expires - Date.now());
      setRemaining(left);
      if (left === 0) setPhase("gone");
    };

    tick();
    const clock = setInterval(tick, CLOCK_MS);
    return () => clearInterval(clock);
  }, [phase, reward]);

  if (phase === "given" && reward) {
    return <Given reward={reward} onAgain={again} />;
  }

  if (phase === "settled" && reward) {
    return <Paid reward={reward} hash={hash} onAgain={again} />;
  }

  return (
    <main className="flex flex-1 flex-col pb-4 pt-6">
      <Reveal>
        <span className="label-type text-stamp">At the counter</span>
      </Reveal>

      <Reveal delay={0.06}>
        <h1
          className="display-type mt-3 text-paper"
          style={{ fontSize: "clamp(2.25rem, 12vw, 3.25rem)", letterSpacing: "-0.04em", lineHeight: 0.92 }}
        >
          {phase === "reward" || phase === "confirming"
            ? "Hand it over"
            : phase === "owed" ||
                phase === "dialog" ||
                phase === "settling" ||
                phase === "slow" ||
                phase === "unsettled"
              ? "Pay the cashback"
              : "Take a code"}
        </h1>
      </Reveal>

      {(phase === "idle" || phase === "camera" || phase === "looking") && (
        <>
          <Reveal delay={0.12}>
            <p className="mt-4 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/70">
              Scan the code on the customer&rsquo;s phone, or type the six digits they read out.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-8">
              <ScanStage
                open={phase === "camera"}
                looking={phase === "looking"}
                reduced={reduced === true}
                onStart={() => void openCamera()}
                onClose={() => void closeCamera()}
              />
            </div>
          </Reveal>

          {hint && (
            <Reveal delay={0.22}>
              <p className="mt-4 text-sm leading-relaxed text-paper/50">{hint}</p>
            </Reveal>
          )}

          <Reveal delay={0.26}>
            <div className="mt-10">
              <Perforation className="mb-7 text-paper" />
              <label htmlFor="six-digits" className="label-type block text-paper/45">
                Six digits
              </label>
              <input
                id="six-digits"
                className="merchant-field code-field mt-3"
                value={typed}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder="000000"
                onChange={(event) => setTyped(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <div className="mt-6">
                <Button
                  onClick={() => void lookUp(typed)}
                  disabled={typed.length !== 6 || phase === "looking" || working}
                >
                  Look up
                  <Arrow />
                </Button>
              </div>
              {message && <p className="mt-4 text-sm leading-relaxed text-paper/60">{message}</p>}
            </div>
          </Reveal>
        </>
      )}

      {(phase === "reward" || phase === "confirming") && reward && (
        <Reveal delay={0.12}>
          <div className="mt-8 rounded-[14px] border border-line p-5">
            <span className="label-type text-paper/45">{reward.cardName}</span>
            <p className="display-type mt-3 text-[1.75rem] leading-tight tracking-[-0.03em] text-paper">
              {reward.rewardText}
            </p>
            <Perforation className="mt-5 mb-4 text-paper" />
            <dl className="flex flex-col gap-3">
              <Row label="Customer" value={reward.customer} mono />
              <Row
                label={reward.rewardKind === "cashback" ? "You pay back" : "Stamps used"}
                value={
                  reward.rewardKind === "cashback"
                    ? `${formatNim(reward.cashbackLuna)} NIM`
                    : String(reward.stampsConsumed)
                }
                mono
              />
              <Row label="Code good for" value={countdown(remaining)} mono />
              <Row label="Status" value={statusWords(reward.status)} />
            </dl>
          </div>

          <div className="mt-8">
            {phase === "confirming" ? (
              <div className="flex items-center gap-3">
                <Pulse />
                <span className="label-type text-paper/50">Accepting the reward</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Button tone="stamp" onClick={() => void confirm()} disabled={working}>
                  Confirm
                  <Arrow />
                </Button>
                <Button tone="ghost" onClick={again} disabled={working}>
                  Not this one
                </Button>
              </div>
            )}
          </div>
          {message && <p className="mt-4 text-sm leading-relaxed text-paper/60">{message}</p>}
        </Reveal>
      )}

      {(phase === "owed" ||
        phase === "dialog" ||
        phase === "settling" ||
        phase === "slow" ||
        phase === "unsettled") &&
        owed?.amountLuna !== undefined && (
          <Reveal delay={0.12}>
            <p className="mt-5 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/70">
              The reward is accepted. The money goes straight from your wallet to the customer, so
              Vango never holds it.
            </p>

            <div className="mt-8 rounded-[14px] border border-line p-5">
              <span className="label-type text-paper/45">To pay</span>
              <p className="mt-3 font-mono text-[2.5rem] leading-none text-paper">
                {formatNim(owed.amountLuna)}
                <span className="ml-2 text-base text-paper/55">NIM</span>
              </p>
              <Perforation className="mt-5 mb-4 text-paper" />
              <dl className="flex flex-col gap-3">
                <Row label="To" value={owed.payTo ?? ""} mono />
                <Row label="Memo" value={owed.memo ?? ""} mono />
                {hash && <Row label="Payment" value={shortHash(hash)} mono />}
              </dl>
            </div>

            <div className="mt-8">
              {phase === "dialog" && (
                <div className="flex items-center gap-3">
                  <Pulse />
                  <span className="label-type text-paper/50">Confirm in Nimiq Pay</span>
                </div>
              )}

              {phase === "settling" && (
                <>
                  <div className="flex items-center gap-3">
                    <Pulse />
                    <span className="label-type text-paper/50">Waiting for the chain</span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-paper/45">
                    Your payment is out. Vango reads it back off the chain before it calls this
                    reward paid, which takes a few seconds.
                  </p>
                </>
              )}

              {phase === "slow" && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm leading-relaxed text-paper/60">
                    The chain has not shown Vango that payment yet. It is not lost: check again in a
                    moment.
                  </p>
                  <Button onClick={() => void (hash && settle(hash))} disabled={working}>
                    Check again
                  </Button>
                </div>
              )}

              {phase === "unsettled" && (
                <div className="flex flex-col gap-3">
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-bad" />
                    <span className="label-type text-paper/50">Not settled</span>
                  </span>
                  <p className="text-sm leading-relaxed text-paper/60">
                    {message ?? "Vango could not match that payment to this reward."}
                  </p>
                  <Button
                    tone="stamp"
                    onClick={() => void (hash && settle(hash))}
                    disabled={working}
                  >
                    Try settling again
                    <Arrow />
                  </Button>
                  <Button tone="ghost" onClick={again} disabled={working}>
                    Start again
                  </Button>
                  <p className="text-sm leading-relaxed text-paper/45">
                    The payment already left your wallet. Scanning the same code again settles it
                    later, so nothing is lost by starting again.
                  </p>
                </div>
              )}

              {phase === "owed" && (
                <div className="flex flex-col gap-3">
                  <Button tone="stamp" onClick={() => void pay()} disabled={working}>
                    Pay {formatNim(owed.amountLuna)} NIM to the customer
                    <Arrow />
                  </Button>
                  <Button tone="ghost" onClick={again} disabled={working}>
                    Later
                  </Button>
                </div>
              )}
            </div>
            {message && phase !== "unsettled" && (
              <p className="mt-4 text-sm leading-relaxed text-paper/60">{message}</p>
            )}
          </Reveal>
        )}

      {phase === "gone" && (
        <Reveal delay={0.12}>
          <p className="mt-5 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/70">
            {message ??
              (reward?.status === "confirmed"
                ? "This reward was already given, so there is nothing left to hand over."
                : "That code ran out. A signed reward lasts ten minutes. Ask the customer to sign a new one and it works again.")}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Button onClick={again} disabled={working}>
              Take another code
            </Button>
            <ButtonLink href="/app" tone="ghost">
              Your cards
            </ButtonLink>
          </div>
        </Reveal>
      )}

      {phase === "failed" && (
        <Reveal delay={0.12}>
          <span className="mt-5 flex items-center gap-2.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-bad" />
            <span className="label-type text-paper/50">Not done</span>
          </span>
          <p className="mt-4 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/70">
            {message ?? "Vango could not finish that."}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Button onClick={again} disabled={working}>
              Start again
            </Button>
            <ButtonLink href="/app" tone="ghost">
              Your cards
            </ButtonLink>
          </div>
        </Reveal>
      )}
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="label-type shrink-0 text-paper/40">{label}</dt>
      <dd
        className={`min-w-0 break-all text-right text-sm ${mono ? "font-mono text-paper/80" : "text-paper/80"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ScanStage({
  open,
  looking,
  reduced,
  onStart,
  onClose,
}: {
  open: boolean;
  looking: boolean;
  reduced: boolean;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-line bg-black/40">
      <div
        id={STAGE_ID}
        className="scan-stage relative w-full"
        style={{ aspectRatio: "1 / 1", display: open ? "block" : "none" }}
      />

      {!open && (
        <div className="relative flex flex-col items-center justify-center gap-6 px-6" style={{ aspectRatio: "1 / 1" }}>
          <span aria-hidden className="grain-layer" style={{ opacity: 0.05 }} />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(closest-side at 50% 45%, rgba(255,90,44,0.16), rgba(255,90,44,0.02) 60%, transparent)",
            }}
          />
          {looking ? (
            <div className="relative flex items-center gap-3">
              <Pulse />
              <span className="label-type text-paper/50">Reading the code</span>
            </div>
          ) : (
            <div className="relative w-full max-w-[260px]">
              <Button onClick={onStart}>Start camera</Button>
            </div>
          )}
        </div>
      )}

      <span aria-hidden className="scan-corner scan-corner-tl left-4 top-4" />
      <span aria-hidden className="scan-corner scan-corner-tr right-4 top-4" />
      <span aria-hidden className="scan-corner scan-corner-bl bottom-4 left-4" />
      <span aria-hidden className="scan-corner scan-corner-br bottom-4 right-4" />

      {open && !reduced && (
        <motion.span
          aria-hidden
          className="scan-sweep pointer-events-none absolute left-6 right-6 top-1/2 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,90,44,0.9), transparent)" }}
        />
      )}

      {open && (
        <button
          type="button"
          onClick={onClose}
          className="label-type absolute bottom-4 left-1/2 -translate-x-1/2 rounded-[8px] border border-line bg-ink/70 px-4 py-2.5 text-paper/70 transition-colors duration-300 hover:border-paper/35 hover:text-paper"
        >
          Close camera
        </button>
      )}
    </div>
  );
}

function BigStamp() {
  return (
    <span className="relative flex h-24 w-24 items-center justify-center rounded-full border border-line">
      <span
        aria-hidden
        className="absolute inset-[6px] rounded-full bg-stamp"
        style={{ boxShadow: "0 0 40px rgba(255,90,44,0.5)" }}
      />
      <svg aria-hidden viewBox="0 0 24 24" className="absolute inset-0 h-full w-full opacity-30">
        <path
          d="M12 6.5v11M6.5 12h11M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6"
          stroke="#0b0f1a"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function Given({ reward, onAgain }: { reward: RedemptionView; onAgain: () => void }) {
  return (
    <main className="flex flex-1 flex-col justify-center py-8">
      <Reveal>
        <BigStamp />
      </Reveal>
      <Reveal delay={0.1}>
        <span className="label-type mt-8 block text-stamp">Reward given</span>
        <h1
          className="display-type mt-3 text-paper"
          style={{ fontSize: "clamp(2.25rem, 12vw, 3.25rem)", letterSpacing: "-0.04em", lineHeight: 0.92 }}
        >
          {reward.rewardText}
        </h1>
      </Reveal>
      <Reveal delay={0.18}>
        <p className="mt-5 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/65">
          {reward.stampsConsumed} stamps came off the customer&rsquo;s card and it starts again from
          empty. The customer&rsquo;s phone says so too.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Button tone="stamp" onClick={onAgain}>
            Next customer
            <Arrow />
          </Button>
          <ButtonLink href="/app" tone="ghost">
            Your cards
          </ButtonLink>
        </div>
      </Reveal>
    </main>
  );
}

function Paid({
  reward,
  hash,
  onAgain,
}: {
  reward: RedemptionView;
  hash: string | null;
  onAgain: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col justify-center py-8">
      <Reveal>
        <BigStamp />
      </Reveal>
      <Reveal delay={0.1}>
        <span className="label-type mt-8 block text-stamp">Cashback paid</span>
        <h1
          className="display-type mt-3 text-paper"
          style={{ fontSize: "clamp(2.25rem, 12vw, 3.25rem)", letterSpacing: "-0.04em", lineHeight: 0.92 }}
        >
          {formatNim(reward.cashbackLuna)} NIM sent
        </h1>
      </Reveal>
      <Reveal delay={0.18}>
        <p className="mt-5 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/65">
          The chain has your payment and Vango has matched it to this reward. Nothing else to do.
        </p>
        {hash && <p className="label-type mt-5 text-paper/40">Payment {shortHash(hash)}</p>}
        <div className="mt-8 flex flex-col gap-3">
          <Button tone="stamp" onClick={onAgain}>
            Next customer
            <Arrow />
          </Button>
          <ButtonLink href="/app" tone="ghost">
            Your cards
          </ButtonLink>
        </div>
      </Reveal>
    </main>
  );
}
