"use client";

import { useState } from "react";
import Link from "next/link";
import type { CardSummary } from "@/lib/api";
import { useWallet } from "./ConnectGate";
import HeldCardRow from "./HeldCardRow";
import Perforation from "./Perforation";
import Reveal from "./Reveal";

export default function WalletHome() {
  const { me, reloadMe } = useWallet();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const held = me?.held ?? [];
  const owned = me?.owned ?? [];

  const refresh = async () => {
    setRefreshing(true);
    setRefreshFailed(false);
    const fresh = await reloadMe();
    setRefreshing(false);
    if (!fresh) setRefreshFailed(true);
  };

  return (
    <main className="flex flex-1 flex-col pb-4 pt-10">
      <Reveal>
        <span className="label-type text-paper/45">In your wallet</span>
      </Reveal>

      <Reveal delay={0.08}>
        <h1
          className="display-type mt-3 text-paper"
          style={{
            fontSize: "clamp(2.5rem, 13vw, 3.5rem)",
            letterSpacing: "-0.04em",
            lineHeight: 0.92,
          }}
        >
          {held.length === 0 ? "Nothing stamped yet" : held.length === 1 ? "One card" : `${held.length} cards`}
        </h1>
      </Reveal>

      <Reveal delay={0.14}>
        <div className="mt-4 flex items-start justify-between gap-5">
          <p className="max-w-[30ch] text-[0.9375rem] leading-relaxed text-paper/60">
            Pay a shop in NIM and the stamp lands here by itself.
          </p>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="label-type shrink-0 text-paper/45 underline decoration-paper/20 underline-offset-4 transition-colors duration-300 hover:text-paper hover:decoration-stamp disabled:opacity-50"
          >
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </Reveal>

      {refreshFailed && (
        <Reveal>
          <p className="mt-3 text-sm text-bad/90">
            Vango could not reach the server. Check your connection and tap Refresh again.
          </p>
        </Reveal>
      )}

      {held.length === 0 ? (
        <Reveal delay={0.2}>
          <div className="mt-8 rounded-[14px] border border-dashed border-line p-6">
            <p className="text-[1.0625rem] leading-relaxed text-paper/70">
              No cards yet. Scan a Vango card at the counter, or open a link a shop sent you.
            </p>
          </div>
        </Reveal>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {held.map((card, index) => (
            <HeldCardRow key={card.code} card={card} delay={index * 0.06} />
          ))}
        </div>
      )}

      <section className="mt-14">
        <Reveal onView>
          <Perforation className="mb-6 text-paper" />
          <span className="label-type text-paper/45">Your cards</span>
        </Reveal>
        <div className="mt-4 flex flex-col gap-3">
          {owned.map((card, index) => (
            <OwnedCardRow key={card.code} card={card} delay={index * 0.06} />
          ))}
          <Reveal delay={owned.length * 0.06} onView>
            <Link
              href="/app/merchant/new"
              className="group flex items-center justify-between gap-4 rounded-[8px] border border-dashed border-line px-4 py-3.5 text-paper/70 transition-[border-color,color] duration-300 hover:border-paper/40 hover:text-paper"
            >
              <span className="text-[0.9375rem]">
                {owned.length === 0 ? "Run a shop? Create a card" : "Create another card"}
              </span>
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
            </Link>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

function OwnedCardRow({ card, delay }: { card: CardSummary; delay: number }) {
  return (
    <Reveal delay={delay} onView>
      <Link
        href={`/app/merchant/${card.code}`}
        className="group flex items-center justify-between gap-4 rounded-[8px] border border-line px-4 py-3.5 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-paper/25"
      >
        <span className="min-w-0">
          <span className="display-type block truncate text-[1.0625rem] text-paper">{card.name}</span>
          <span className="label-type mt-1 block text-paper/40">
            {card.code} &middot; {card.stampCount} stamps &middot; {card.customerCount} customers
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${card.active ? "bg-ok" : "bg-paper/25"}`}
          />
          <span className="label-type text-paper/35 transition-transform duration-300 group-hover:translate-x-0.5">
            {card.active ? "Open" : "Paused"}
          </span>
        </span>
      </Link>
    </Reveal>
  );
}
