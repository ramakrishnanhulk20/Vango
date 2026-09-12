"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  progressFromError,
  signRedeem,
  startRedeem,
  type CardProgress,
  type RedeemStart,
} from "@/lib/api";
import { formatNim, progressLabel } from "@/lib/money";
import { isUserCancel, unwrap, type SignatureResult } from "@/lib/nimiq";
import {
  forgetTicket,
  readTicket,
  ticketIsLive,
  writeTicket,
  type RedeemTicket,
} from "@/lib/redeemTicket";
import { Arrow, Button, ButtonLink } from "./Button";
import { Pulse, useWallet } from "./ConnectGate";
import Perforation from "./Perforation";
import QrCode from "./QrCode";
import Reveal from "./Reveal";
import StampRow from "./StampRow";

const WATCH_MS = 3_000;
const CLOCK_MS = 1_000;

type Phase =
  | "checking"
  | "not-full"
  | "offer"
  | "signing"
  | "waiting"
  | "confirmed"
  | "expired"
  | "busy"
  | "failed";

function isAlreadyWaiting(error: ApiError): boolean {
  return error.status === 409 && /already waiting/i.test(error.message);
}

function countdown(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Taking the reward.
 *
 * The wallet signs a one-shot challenge, and what comes back is a code the merchant can
 * read but nobody can forge. Vango cannot tell the phone when the counter accepts it, so
 * this screen watches the customer's own card instead: when the stamps drop below where
 * they stood at signing time, the reward was handed over. The baseline is read back from
 * the server right after the signature, so a stamp that landed while the customer was
 * walking to the counter cannot look like a hand-over.
 */
export default function RedeemFlow({ code }: { code: string }) {
  const { provider, me, reloadMe } = useWallet();
  const [phase, setPhase] = useState<Phase>("checking");
  const [offer, setOffer] = useState<RedeemStart | null>(null);
  const [ticket, setTicket] = useState<RedeemTicket | null>(null);
  const [progress, setProgress] = useState<CardProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const meRef = useRef(me);
  meRef.current = me;

  const held = me?.held.find((entry) => entry.code === code) ?? null;
  const cardName = held?.merchantName ?? held?.name ?? code;
  const rewardText = ticket?.rewardText ?? offer?.reward.text ?? held?.rewardText ?? "reward";

  const refused = useCallback(
    (thrown: unknown) => {
      if (thrown instanceof ApiError) {
        if (isAlreadyWaiting(thrown)) {
          const kept = readTicket(code);
          if (kept) {
            setTicket(kept);
            setPhase("waiting");
            return;
          }
          setPhase("busy");
          return;
        }
        const standing = progressFromError(thrown);
        if (standing) setProgress(standing);
        if (thrown.status === 409) {
          setPhase("not-full");
          return;
        }
        setMessage(thrown.message);
        setPhase("failed");
        return;
      }
      setMessage(thrown instanceof Error ? thrown.message : "Something went wrong.");
      setPhase("failed");
    },
    [code],
  );

  useEffect(() => {
    let alive = true;

    const begin = async () => {
      const existing = readTicket(code);
      if (existing && ticketIsLive(existing)) {
        setTicket(existing);
        setPhase("waiting");
        return;
      }
      if (existing) forgetTicket(code);

      const entry = meRef.current?.held.find((row) => row.code === code) ?? null;
      if (entry) setProgress(entry.progress);
      if (!entry || !entry.progress.redeemable) {
        setPhase("not-full");
        return;
      }

      setPhase("checking");
      try {
        const started = await startRedeem(code);
        if (!alive) return;
        setOffer(started);
        setPhase("offer");
      } catch (thrown) {
        if (!alive) return;
        refused(thrown);
      }
    };

    void begin();
    return () => {
      alive = false;
    };
  }, [attempt, code, refused]);

  const check = useCallback(
    async (live: RedeemTicket) => {
      const mine = await reloadMe();
      const entry = mine?.held.find((row) => row.code === code) ?? null;
      if (!entry) return;
      const dropped =
        entry.progress.target === null
          ? entry.progress.cashbackLuna < live.baselineCashbackLuna
          : entry.progress.stamps < live.baselineStamps;
      if (!dropped) return;
      forgetTicket(code);
      setProgress(entry.progress);
      setPhase("confirmed");
    },
    [code, reloadMe],
  );

  useEffect(() => {
    if (phase !== "waiting" || !ticket) return;
    const expires = Date.parse(ticket.expiresAt);

    const tick = () => {
      const left = Math.max(0, expires - Date.now());
      setRemaining(left);
      if (left === 0) {
        forgetTicket(code);
        setPhase("expired");
      }
    };

    tick();
    const clock = setInterval(tick, CLOCK_MS);
    const watch = setInterval(() => void check(ticket), WATCH_MS);

    return () => {
      clearInterval(clock);
      clearInterval(watch);
    };
  }, [check, code, phase, ticket]);

  const sign = async () => {
    if (!provider || !offer) return;
    setMessage(null);
    setPhase("signing");

    let signed: SignatureResult;
    try {
      signed = unwrap<SignatureResult>(await provider.sign(offer.message));
    } catch (thrown) {
      if (isUserCancel(thrown)) {
        setMessage("You closed the signature. Nothing was used up.");
        setPhase("offer");
        return;
      }
      setMessage(thrown instanceof Error ? thrown.message : "The wallet could not sign that.");
      setPhase("failed");
      return;
    }

    try {
      const result = await signRedeem({
        message: offer.message,
        publicKey: signed.publicKey,
        signature: signed.signature,
      });
      const mine = await reloadMe();
      const entry = mine?.held.find((row) => row.code === code) ?? null;
      const standing = entry?.progress ?? progress;
      const live: RedeemTicket = {
        token: result.token,
        code6: result.code6,
        expiresAt: result.expiresAt,
        rewardText: result.reward.text,
        baselineStamps: standing?.stamps ?? 0,
        baselineCashbackLuna: standing?.cashbackLuna ?? 0,
      };
      if (standing) setProgress(standing);
      writeTicket(code, live);
      setTicket(live);
      setPhase("waiting");
    } catch (thrown) {
      refused(thrown);
    }
  };

  const restart = () => {
    setMessage(null);
    setOffer(null);
    setTicket(null);
    setPhase("checking");
    setAttempt((count) => count + 1);
  };

  if (phase === "waiting" && ticket) {
    return <Ticket ticket={ticket} cardName={cardName} remaining={remaining} />;
  }

  if (phase === "confirmed") {
    return <Enjoy rewardText={rewardText} code={code} progress={progress} />;
  }

  return (
    <main className="flex flex-1 flex-col pb-4 pt-8">
      <Reveal>
        <Link
          href={`/app/c/${code}`}
          className="label-type group inline-flex items-center gap-2 text-paper/40 transition-colors duration-300 hover:text-paper"
        >
          <span aria-hidden className="transition-transform duration-300 group-hover:-translate-x-1">
            &larr;
          </span>
          {cardName}
        </Link>
      </Reveal>

      <div className="flex flex-1 flex-col justify-center py-8">
        {phase === "checking" && (
          <Reveal>
            <span className="label-type text-paper/45">Reward</span>
            <h1 className="display-type mt-4 text-[2rem] leading-tight tracking-[-0.03em] text-paper">
              Checking your card
            </h1>
            <div className="mt-6">
              <Pulse />
            </div>
          </Reveal>
        )}

        {phase === "not-full" && (
          <Reveal>
            <span className="label-type text-paper/45">Reward</span>
            <h1 className="display-type mt-4 text-[2rem] leading-tight tracking-[-0.03em] text-paper">
              Not full yet
            </h1>
            <p className="mt-4 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/65">
              {progress && progress.target !== null
                ? `You are at ${progressLabel(progress.stamps, progress.target)}. One more payment gets you closer.`
                : "There is nothing to take on this card right now. Pay the shop and it starts filling."}
            </p>
            {progress && progress.target !== null && (
              <div className="mt-6">
                <StampRow
                  filled={Math.min(progress.stamps, progress.target)}
                  slots={progress.target}
                  size="md"
                />
              </div>
            )}
            <div className="mt-8">
              <ButtonLink href={`/app/c/${code}`} tone="ghost">
                Back to the card
              </ButtonLink>
            </div>
          </Reveal>
        )}

        {(phase === "offer" || phase === "signing") && (
          <Reveal>
            <span className="label-type text-stamp">Your reward</span>
            <h1
              className="display-type mt-4 text-paper"
              style={{
                fontSize: "clamp(2.25rem, 12vw, 3.25rem)",
                letterSpacing: "-0.04em",
                lineHeight: 0.92,
              }}
            >
              {rewardText}
            </h1>
            <p className="mt-5 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/70">
              Your wallet signs once. The counter gets a code only your wallet could have made.
            </p>
            {offer?.reward.kind === "cashback" && offer.reward.cashbackLuna !== undefined && (
              <p className="label-type mt-4 text-paper/50">
                {formatNim(offer.reward.cashbackLuna)} NIM comes back to you
              </p>
            )}
            {offer?.reward.kind === "nth_free" && offer.reward.stampsToConsume !== undefined && (
              <p className="label-type mt-4 text-paper/50">
                Uses {offer.reward.stampsToConsume} stamps from this card
              </p>
            )}

            <Perforation className="mt-8 text-paper" />

            <div className="mt-8">
              {phase === "signing" ? (
                <div className="flex items-center gap-3">
                  <Pulse />
                  <span className="label-type text-paper/50">Confirm in Nimiq Pay</span>
                </div>
              ) : (
                <Button tone="stamp" onClick={() => void sign()}>
                  Sign to redeem
                  <Arrow />
                </Button>
              )}
            </div>
            {message && <p className="mt-4 text-sm text-paper/60">{message}</p>}
          </Reveal>
        )}

        {phase === "expired" && (
          <Reveal>
            <span className="label-type text-paper/45">Reward</span>
            <h1 className="display-type mt-4 text-[2rem] leading-tight tracking-[-0.03em] text-paper">
              That code ran out
            </h1>
            <p className="mt-4 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/65">
              A signed reward lasts ten minutes. Your stamps are untouched, so sign a new one when
              the counter is ready.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <Button onClick={restart}>Sign a new one</Button>
              <ButtonLink href={`/app/c/${code}`} tone="ghost">
                Back to the card
              </ButtonLink>
            </div>
          </Reveal>
        )}

        {phase === "busy" && (
          <Reveal>
            <span className="label-type text-paper/45">Reward</span>
            <h1 className="display-type mt-4 text-[2rem] leading-tight tracking-[-0.03em] text-paper">
              One is already waiting
            </h1>
            <p className="mt-4 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/65">
              This card can only have one reward open at a time. If you signed it on another phone,
              show that one at the counter. Otherwise it clears itself within ten minutes.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <Button onClick={restart}>Try again</Button>
              <ButtonLink href={`/app/c/${code}`} tone="ghost">
                Back to the card
              </ButtonLink>
            </div>
          </Reveal>
        )}

        {phase === "failed" && (
          <Reveal>
            <span className="flex items-center gap-2.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-bad" />
              <span className="label-type text-paper/50">Reward</span>
            </span>
            <h1 className="display-type mt-4 text-[2rem] leading-tight tracking-[-0.03em] text-paper">
              That did not work
            </h1>
            <p className="mt-4 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/65">
              {message ?? "Vango could not open your reward."}
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <Button onClick={restart}>Try again</Button>
              <ButtonLink href={`/app/c/${code}`} tone="ghost">
                Back to the card
              </ButtonLink>
            </div>
          </Reveal>
        )}
      </div>
    </main>
  );
}

function Ticket({
  ticket,
  cardName,
  remaining,
}: {
  ticket: RedeemTicket;
  cardName: string;
  remaining: number;
}) {
  return (
    <main className="flex flex-1 flex-col justify-center py-8">
      <Reveal>
        <span className="label-type text-stamp">{cardName}</span>
        <h1
          className="display-type mt-3 text-paper"
          style={{
            fontSize: "clamp(2rem, 11vw, 2.75rem)",
            letterSpacing: "-0.04em",
            lineHeight: 0.92,
          }}
        >
          Show this to the counter
        </h1>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="relative mt-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-10 rounded-full opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, rgba(255,90,44,0.28), rgba(255,90,44,0.05) 60%, transparent)",
            }}
          />
          <div className="relative overflow-hidden rounded-[14px] bg-paper p-5 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]">
            <QrCode text={`vango-redeem:${ticket.token}`} className="mx-auto block w-full max-w-[260px]" />
            <div className="mt-5 text-ink">
              <Perforation />
            </div>
            <p className="mt-5 text-center font-mono text-[2.5rem] leading-none tracking-[0.12em] text-ink">
              {ticket.code6}
            </p>
            <p className="label-type mt-3 text-center text-ink/50">Or read out these six digits</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.2}>
        <div className="mt-7 flex items-center justify-between">
          <span className="flex items-center gap-3">
            <Pulse />
            <span className="label-type text-paper/50">Waiting for the counter</span>
          </span>
          <span className="font-mono text-sm text-paper/70">{countdown(remaining)}</span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-paper/45">
          Keep this open. The moment the shop accepts it, this screen says so.
        </p>
      </Reveal>
    </main>
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

function Enjoy({
  rewardText,
  code,
  progress,
}: {
  rewardText: string;
  code: string;
  progress: CardProgress | null;
}) {
  return (
    <main className="flex flex-1 flex-col justify-center py-8">
      <Reveal>
        <BigStamp />
      </Reveal>
      <Reveal delay={0.1}>
        <span className="label-type mt-8 block text-stamp">Given</span>
        <h1
          className="display-type mt-3 text-paper"
          style={{
            fontSize: "clamp(2.25rem, 12vw, 3.25rem)",
            letterSpacing: "-0.04em",
            lineHeight: 0.92,
          }}
        >
          Enjoy your {rewardText}
        </h1>
      </Reveal>
      <Reveal delay={0.18}>
        <p className="mt-5 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/65">
          The counter accepted it and your card started again. Everything that happened is on the
          chain.
        </p>
        {progress && progress.target !== null && (
          <div className="mt-6">
            <StampRow
              filled={Math.min(progress.stamps, progress.target)}
              slots={progress.target}
              size="md"
            />
          </div>
        )}
        <div className="mt-8 flex flex-col gap-3">
          <ButtonLink href={`/app/c/${code}`}>
            Back to the card
            <Arrow />
          </ButtonLink>
          <ButtonLink href="/app" tone="ghost">
            Your cards
          </ButtonLink>
        </div>
      </Reveal>
    </main>
  );
}
