"use client";

import Link from "next/link";
import type { HeldCard } from "@/lib/api";
import { formatNim, progressLabel } from "@/lib/money";
import Perforation from "./Perforation";
import Reveal from "./Reveal";
import StampRow from "./StampRow";

/**
 * One card in the wallet, wearing the same skin as the card on the front page: dark
 * lacquer, one glare, stamp circles, a perforated rule above the small print.
 */
export default function HeldCardRow({ card, delay = 0 }: { card: HeldCard; delay?: number }) {
  const { progress } = card;
  const title = card.merchantName ?? card.name;
  const full = progress.redeemable;

  return (
    <Reveal delay={delay} onView>
      <Link
        href={`/app/c/${card.code}`}
        className="app-card group relative block overflow-hidden rounded-[14px] border border-line p-5 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-paper/25 hover:shadow-[0_26px_50px_-30px_rgba(0,0,0,0.95)]"
      >
        <span
          aria-hidden
          className="app-glare pointer-events-none absolute -left-1/4 -top-1/2 h-[160%] w-[160%] opacity-60"
        />
        <span aria-hidden className="grain-layer" style={{ opacity: 0.04 }} />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <span className="display-type text-[1.3rem] leading-tight tracking-[-0.02em] text-paper">
              {title}
            </span>
            <span
              aria-hidden
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-stamp transition-transform duration-300 group-hover:scale-125"
              style={{ boxShadow: full ? "0 0 14px rgba(255,90,44,0.8)" : "none", opacity: full ? 1 : 0.45 }}
            />
          </div>

          <p className="mt-1.5 text-[0.9375rem] text-paper/65">{card.rewardText}</p>

          <div className="mt-4">
            {progress.target === null ? (
              <span className="font-mono text-2xl text-paper">
                {formatNim(progress.cashbackLuna)}
                <span className="ml-1.5 text-sm text-paper/55">NIM back</span>
              </span>
            ) : (
              <StampRow filled={Math.min(progress.stamps, progress.target)} slots={progress.target} />
            )}
          </div>

          <Perforation className="mt-5 mb-3 text-paper" />

          <div className="flex items-center justify-between">
            <span className="label-type text-paper/50">
              {progress.target === null
                ? `${formatNim(progress.totalLuna)} NIM spent`
                : progressLabel(progress.stamps, progress.target)}
            </span>
            {full ? (
              <span className="label-type text-stamp">Redeem &rarr;</span>
            ) : (
              <span className="label-type text-paper/30">Open</span>
            )}
          </div>
        </div>
      </Link>
    </Reveal>
  );
}
