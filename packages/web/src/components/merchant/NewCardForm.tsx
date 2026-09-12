"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Arrow, Button, ButtonLink } from "@/components/app/Button";
import { Pulse, useWallet } from "@/components/app/ConnectGate";
import Perforation from "@/components/app/Perforation";
import Reveal from "@/components/app/Reveal";
import { ApiError, createCard, type CreateCardBody, type RewardKind } from "@/lib/api";
import { LUNA_PER_NIM, parseNimToLuna } from "@/lib/money";
import CardFace from "./CardFace";

const MIN_VISITS = 2;
const MAX_VISITS = 20;
const MIN_PERCENT = 0.1;
const MAX_PERCENT = 20;
const NAME_MAX = 40;
const REWARD_MAX = 60;

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  const ones = value % 10;
  if (ones === 1) return `${value}st`;
  if (ones === 2) return `${value}nd`;
  if (ones === 3) return `${value}rd`;
  return `${value}th`;
}

function tidy(value: number): string {
  return String(value).replace(/\.0+$/, "");
}

/** The technical field names a refusal comes back with, said the way a shop would say it. */
function plainError(thrown: unknown): string {
  if (!(thrown instanceof ApiError)) {
    return thrown instanceof Error ? thrown.message : "Something went wrong. Try again.";
  }
  const message = thrown.message;
  if (/^name/.test(message)) return `Keep the card name to ${NAME_MAX} letters.`;
  if (/^rewardText/.test(message)) return `Keep the reward line to ${REWARD_MAX} letters.`;
  if (/^targetVisits/.test(message)) return `Pick a number of visits between ${MIN_VISITS} and ${MAX_VISITS}.`;
  if (/^cashbackBps/.test(message)) return `Pick a percentage between ${MIN_PERCENT} and ${MAX_PERCENT}.`;
  if (/^minLuna/.test(message)) return "A payment has to count from 1 NIM up.";
  if (thrown.status === 401) return "Your wallet is signed out. Open Vango again from Nimiq Pay.";
  return message;
}

export default function NewCardForm() {
  const router = useRouter();
  const { reloadMe } = useWallet();
  const reduced = useReducedMotion();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<RewardKind>("nth_free");
  const [visits, setVisits] = useState(5);
  const [percentText, setPercentText] = useState("2");
  const [rewardText, setRewardText] = useState("");
  const [rewardTouched, setRewardTouched] = useState(false);
  const [minText, setMinText] = useState("1");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const percent = Number(percentText.replace(",", "."));
  const percentOk =
    percentText.trim() !== "" && Number.isFinite(percent) && percent >= MIN_PERCENT && percent <= MAX_PERCENT;
  const ruleLine =
    kind === "nth_free"
      ? `Every ${ordinal(visits)} visit is on the house`
      : `${percentOk ? tidy(percent) : "0"}% back in NIM`;
  const suggested = kind === "nth_free" ? "Free coffee" : `${percentOk ? tidy(percent) : "0"}% back`;
  const reward = rewardTouched ? rewardText : suggested;
  const minLuna = parseNimToLuna(minText);

  const open = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setProblem("Give the card the name a customer would read on your counter.");
      return;
    }
    if (trimmedName.length > NAME_MAX) {
      setProblem(`Keep the card name to ${NAME_MAX} letters.`);
      return;
    }
    const trimmedReward = reward.trim();
    if (trimmedReward.length === 0 || trimmedReward.length > REWARD_MAX) {
      setProblem(`Say what the customer gets, in up to ${REWARD_MAX} letters.`);
      return;
    }
    if (kind === "cashback" && !percentOk) {
      setProblem(`Pick a percentage between ${MIN_PERCENT} and ${MAX_PERCENT}.`);
      return;
    }
    if (minLuna === null || minLuna < LUNA_PER_NIM) {
      setProblem("A payment has to count from 1 NIM up.");
      return;
    }

    const body: CreateCardBody =
      kind === "nth_free"
        ? {
            name: trimmedName,
            rewardKind: "nth_free",
            targetVisits: visits,
            rewardText: trimmedReward,
            minLuna,
          }
        : {
            name: trimmedName,
            rewardKind: "cashback",
            cashbackBps: Math.round(percent * 100),
            rewardText: trimmedReward,
            minLuna,
          };

    setProblem(null);
    setSending(true);
    try {
      const card = await createCard(body);
      await reloadMe();
      router.push(`/app/merchant/${card.code}`);
    } catch (thrown) {
      setProblem(plainError(thrown));
      setSending(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col pb-4 pt-6">
      <Reveal>
        <span className="label-type text-stamp">Your counter</span>
      </Reveal>

      <Reveal delay={0.06}>
        <h1
          className="display-type mt-3 text-paper"
          style={{ fontSize: "clamp(2.5rem, 13vw, 3.5rem)", letterSpacing: "-0.04em", lineHeight: 0.92 }}
        >
          Open a card
        </h1>
      </Reveal>

      <Reveal delay={0.12}>
        <p className="mt-4 max-w-[32ch] text-[1.0625rem] leading-relaxed text-paper/70">
          Your card receives payments at the wallet you are signed in with.
        </p>
      </Reveal>

      <Reveal delay={0.18}>
        <motion.div
          className="mt-8 -mr-1"
          animate={reduced ? { rotate: -1.2 } : { rotate: [-1.2, -0.4, -1.2] }}
          transition={reduced ? { duration: 0 } : { duration: 9, repeat: Infinity, ease: "easeInOut" }}
        >
          <CardFace
            name={name}
            rewardText={reward}
            ruleLine={ruleLine}
            slots={kind === "nth_free" ? visits : null}
            percent={kind === "cashback" && percentOk ? percent : null}
            minLuna={minLuna ?? LUNA_PER_NIM}
          />
        </motion.div>
      </Reveal>

      <Reveal delay={0.24}>
        <div className="mt-10">
          <label htmlFor="card-name" className="label-type block text-paper/45">
            Card name
          </label>
          <input
            id="card-name"
            className="merchant-field mt-2"
            value={name}
            maxLength={NAME_MAX}
            placeholder="Kadai Coffee"
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
          <span className="label-type mt-2 block text-paper/30">
            {name.length} of {NAME_MAX}
          </span>
        </div>
      </Reveal>

      <Reveal delay={0.3}>
        <div className="mt-9">
          <span className="label-type block text-paper/45">What the card gives</span>
          <div className="mt-3 flex flex-col gap-3">
            <Tile
              title="Every Nth visit is on the house"
              body="Each payment inks one stamp. A full card is a free one."
              selected={kind === "nth_free"}
              onSelect={() => setKind("nth_free")}
            >
              <Stepper value={visits} onChange={setVisits} />
            </Tile>

            <Tile
              title="Cashback in NIM"
              body="A share of everything the customer pays goes back to them."
              selected={kind === "cashback"}
              onSelect={() => setKind("cashback")}
            >
              <div className="flex items-baseline gap-3">
                <input
                  id="card-percent"
                  className="merchant-field font-mono text-2xl"
                  style={{ width: "5.5rem" }}
                  value={percentText}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label="Percent back"
                  onChange={(event) => setPercentText(event.target.value)}
                />
                <span className="label-type text-paper/45">percent back</span>
              </div>
              {!percentOk && (
                <p className="mt-3 text-sm text-bad/90">
                  Anything from {MIN_PERCENT} to {MAX_PERCENT} percent.
                </p>
              )}
            </Tile>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.36}>
        <div className="mt-9">
          <label htmlFor="reward-text" className="label-type block text-paper/45">
            The reward, in your own words
          </label>
          <input
            id="reward-text"
            className="merchant-field mt-2"
            value={reward}
            maxLength={REWARD_MAX}
            autoComplete="off"
            onChange={(event) => {
              setRewardTouched(true);
              setRewardText(event.target.value);
            }}
          />
          <span className="label-type mt-2 block text-paper/30">
            {reward.length} of {REWARD_MAX}
          </span>
        </div>
      </Reveal>

      <Reveal delay={0.42}>
        <div className="mt-9">
          <label htmlFor="card-min" className="label-type block text-paper/45">
            Smallest payment that counts
          </label>
          <div className="mt-2 flex items-baseline gap-3">
            <input
              id="card-min"
              className="merchant-field font-mono text-2xl"
              style={{ width: "7rem" }}
              value={minText}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => setMinText(event.target.value)}
            />
            <span className="label-type text-paper/45">NIM</span>
          </div>
          {(minLuna === null || minLuna < LUNA_PER_NIM) && (
            <p className="mt-3 text-sm text-bad/90">One NIM is the floor, so nothing below it counts.</p>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.48}>
        <div className="mt-12">
          <Perforation className="mb-8 text-paper" />
          {sending ? (
            <div className="flex items-center gap-3">
              <Pulse />
              <span className="label-type text-paper/50">Opening the card</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Button tone="stamp" onClick={() => void open()}>
                Open the card
                <Arrow />
              </Button>
              <ButtonLink href="/app" tone="ghost">
                Not now
              </ButtonLink>
            </div>
          )}
          {problem && <p className="mt-4 text-sm leading-relaxed text-bad/90">{problem}</p>}
        </div>
      </Reveal>
    </main>
  );
}

function Tile({
  title,
  body,
  selected,
  onSelect,
  children,
}: {
  title: string;
  body: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <div
      className="relative overflow-hidden rounded-[8px] border p-5 transition-[border-color,background-color] duration-300"
      style={{
        borderColor: selected ? "rgba(255,90,44,0.55)" : "var(--line)",
        backgroundColor: selected ? "rgba(255,90,44,0.05)" : "transparent",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="group flex w-full items-start gap-3.5 text-left"
      >
        <span
          className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-300"
          style={{ borderColor: selected ? "var(--stamp)" : "rgba(243,239,230,0.3)" }}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-stamp transition-transform duration-300 group-hover:scale-125"
            style={{ transform: selected ? "scale(1)" : "scale(0)", boxShadow: "0 0 12px rgba(255,90,44,0.7)" }}
          />
        </span>
        <span>
          <span className="display-type block text-[1.125rem] leading-snug tracking-[-0.02em] text-paper">
            {title}
          </span>
          <span className="mt-1.5 block text-sm leading-relaxed text-paper/55">{body}</span>
        </span>
      </button>

      {selected && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 pl-7"
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const step = (delta: number) => {
    const next = value + delta;
    if (next < MIN_VISITS || next > MAX_VISITS) return;
    onChange(next);
  };

  return (
    <div className="flex items-center gap-4">
      <StepButton label="One fewer visit" sign="-" onClick={() => step(-1)} disabled={value <= MIN_VISITS} />
      <span className="font-mono text-3xl leading-none text-paper" aria-live="polite">
        {value}
      </span>
      <StepButton label="One more visit" sign="+" onClick={() => step(1)} disabled={value >= MAX_VISITS} />
      <span className="label-type text-paper/45">visits</span>
    </div>
  );
}

function StepButton({
  label,
  sign,
  onClick,
  disabled,
}: {
  label: string;
  sign: "-" | "+";
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-line font-mono text-lg text-paper/80 transition-[border-color,transform,color] duration-300 hover:-translate-y-0.5 hover:border-paper/35 hover:text-paper disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
    >
      {sign}
    </button>
  );
}
