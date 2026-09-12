"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Arrow, Button, ButtonLink } from "@/components/app/Button";
import { Pulse, useWallet } from "@/components/app/ConnectGate";
import Notice from "@/components/app/Notice";
import Perforation from "@/components/app/Perforation";
import QrCode from "@/components/app/QrCode";
import Reveal from "@/components/app/Reveal";
import { ApiError, setCardActive, type CardSummary } from "@/lib/api";
import { ruleText } from "@/lib/cardText";
import { formatNim } from "@/lib/money";
import CardFace from "./CardFace";

const COPIED_MS = 2_000;

/**
 * The shop's own page for one card: what the customer sees, the code to read out, the
 * QR for the counter, and how the card is doing. Every number here comes from the API,
 * which is re-read on arrival so a card opened a second ago is already on screen.
 */
export default function Counter({ code }: { code: string }) {
  const { me, reloadMe } = useWallet();
  const reduced = useReducedMotion();

  const [card, setCard] = useState<CardSummary | null>(() => me?.owned.find((row) => row.code === code) ?? null);
  const [looking, setLooking] = useState(card === null);
  const [switching, setSwitching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLink(`${window.location.origin}/app/c/${code}`);
    setCanShare(typeof navigator.share === "function");
  }, [code]);

  useEffect(() => {
    let alive = true;

    const read = async () => {
      const fresh = await reloadMe();
      if (!alive) return;
      setCard(fresh?.owned.find((row) => row.code === code) ?? null);
      setLooking(false);
    };

    void read();
    return () => {
      alive = false;
    };
  }, [code, reloadMe]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setProblem("This phone would not let Vango copy. Read the code out instead.");
    }
  }, [link]);

  const share = useCallback(async () => {
    if (!card) return;
    try {
      await navigator.share({ title: card.name, text: `${card.name}: ${card.rewardText}`, url: link });
    } catch {
      return;
    }
  }, [card, link]);

  const flip = async () => {
    if (!card) return;
    setProblem(null);
    setSwitching(true);
    try {
      setCard(await setCardActive(card.code, !card.active));
    } catch (thrown) {
      setProblem(
        thrown instanceof ApiError ? thrown.message : "Vango could not reach the server. Try that again.",
      );
    }
    setSwitching(false);
  };

  if (looking) {
    return (
      <Notice label="Your card" title="Reading your card" body="One moment while Vango asks the server." tone="stamp">
        <div className="flex items-center gap-3">
          <Pulse />
          <span className="label-type text-paper/45">Loading</span>
        </div>
      </Notice>
    );
  }

  if (!card) {
    return (
      <Notice
        label="Your card"
        title="Not one of your cards"
        body="This code belongs to another shop, or it is not a card at all. Your own cards are on your wallet page."
      >
        <ButtonLink href="/app" tone="ghost">
          Your cards
        </ButtonLink>
      </Notice>
    );
  }

  const rule = ruleText(card);

  return (
    <main className="flex flex-1 flex-col pb-4 pt-6">
      <Reveal>
        <span className="label-type text-stamp">{card.active ? "Open at the counter" : "Paused"}</span>
      </Reveal>

      <Reveal delay={0.06}>
        <h1
          className="display-type mt-3 text-paper"
          style={{ fontSize: "clamp(2.25rem, 12vw, 3.25rem)", letterSpacing: "-0.04em", lineHeight: 0.92 }}
        >
          {card.name}
        </h1>
      </Reveal>

      <Reveal delay={0.12}>
        <p className="mt-4 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/70">{rule}</p>
      </Reveal>

      <Reveal delay={0.18}>
        <motion.div
          className="mt-8 -mr-1"
          animate={reduced ? { rotate: -1.2 } : { rotate: [-1.2, -0.4, -1.2] }}
          transition={reduced ? { duration: 0 } : { duration: 9, repeat: Infinity, ease: "easeInOut" }}
        >
          <CardFace
            name={card.name}
            rewardText={card.rewardText}
            ruleLine={rule}
            slots={card.rewardKind === "nth_free" ? card.targetVisits : null}
            percent={card.cashbackBps === null ? null : card.cashbackBps / 100}
            minLuna={card.minLuna}
            code={card.code}
            paused={!card.active}
          />
        </motion.div>
      </Reveal>

      <Reveal delay={0.24}>
        <div className="relative mt-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-8 rounded-full opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, rgba(255,90,44,0.22), rgba(255,90,44,0.04) 60%, transparent)",
            }}
          />
          <div className="relative overflow-hidden rounded-[14px] bg-paper p-5 shadow-[0_40px_80px_-34px_rgba(0,0,0,0.9)]">
            {link ? (
              <QrCode text={link} className="mx-auto block w-full max-w-[240px]" />
            ) : (
              <div className="mx-auto h-[240px] w-full max-w-[240px]" />
            )}
            <div className="mt-5 text-ink">
              <Perforation />
            </div>
            <p className="mt-5 text-center font-mono text-[2.25rem] leading-none tracking-[0.16em] text-ink">
              {card.code}
            </p>
            <p className="label-type mt-3 text-center text-ink/50">Stand this on the counter</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.3}>
        <div className="mt-6 flex gap-3">
          <SmallButton label={copied ? "Copied" : "Copy link"} onClick={() => void copy()} />
          {canShare && <SmallButton label="Share" onClick={() => void share()} />}
        </div>
        <p className="label-type mt-5 text-paper/35">
          Memo <span className="normal-case tracking-normal text-paper/70">vango:{card.code}</span>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-paper/45">
          A customer pays that memo from their wallet and the stamp lands on its own. Payments come in at{" "}
          {formatNim(card.minLuna)} NIM and up.
        </p>
      </Reveal>

      <Reveal delay={0.36} onView>
        <div className="mt-10">
          <Perforation className="mb-6 text-paper" />
          <div className="flex items-end gap-10">
            <Count value={card.stampCount} label={card.stampCount === 1 ? "stamp given" : "stamps given"} big />
            <Count
              value={card.customerCount}
              label={card.customerCount === 1 ? "customer" : "customers"}
              big={false}
            />
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.42} onView>
        <div className="mt-12 flex flex-col gap-3">
          <ButtonLink href="/app/merchant/redeem" tone="stamp">
            Redeem a reward
            <Arrow />
          </ButtonLink>
          <Button tone="ghost" onClick={() => void flip()} disabled={switching}>
            {switching ? "Saving" : card.active ? "Pause this card" : "Open this card again"}
          </Button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-paper/45">
          {card.active
            ? "Paused cards stop collecting stamps. Stamps already given stay where they are."
            : "This card collects nothing while it is paused. Open it again when you are back."}
        </p>
        {problem && <p className="mt-4 text-sm text-bad/90">{problem}</p>}
        <div className="mt-8">
          <Link
            href="/app/merchant/new"
            className="label-type text-paper/40 underline decoration-paper/20 underline-offset-4 transition-colors duration-300 hover:text-paper hover:decoration-stamp"
          >
            Open another card
          </Link>
        </div>
      </Reveal>
    </main>
  );
}

function Count({ value, label, big }: { value: number; label: string; big: boolean }) {
  return (
    <span className="flex flex-col">
      <span
        className="font-mono leading-none text-paper"
        style={{ fontSize: big ? "clamp(3rem, 16vw, 4.5rem)" : "clamp(1.75rem, 9vw, 2.5rem)" }}
      >
        {value}
      </span>
      <span className="label-type mt-3 text-paper/45">{label}</span>
    </span>
  );
}

function SmallButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="label-type rounded-[8px] border border-line px-4 py-3 text-paper/70 transition-[border-color,transform,color] duration-300 hover:-translate-y-0.5 hover:border-paper/35 hover:text-paper"
    >
      {label}
    </button>
  );
}
