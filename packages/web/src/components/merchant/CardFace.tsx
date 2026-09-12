"use client";

import StampRow from "@/components/app/StampRow";
import Perforation from "@/components/app/Perforation";
import { formatNim } from "@/lib/money";

type CardFaceProps = {
  name: string;
  rewardText: string;
  ruleLine: string;
  /** Stamp slots for an every-Nth card, null when the card pays cashback. */
  slots: number | null;
  percent: number | null;
  minLuna: number;
  code?: string;
  paused?: boolean;
};

/**
 * The card as the customer's wallet will show it, worn by the merchant's own screens:
 * the form fills it in while the shop types, and the counter page keeps it on show.
 */
export default function CardFace({
  name,
  rewardText,
  ruleLine,
  slots,
  percent,
  minLuna,
  code,
  paused = false,
}: CardFaceProps) {
  return (
    <div className="app-card relative overflow-hidden rounded-[14px] border border-line p-5">
      <span
        aria-hidden
        className="app-glare pointer-events-none absolute -left-1/4 -top-1/2 h-[160%] w-[160%] opacity-60"
      />
      <span aria-hidden className="grain-layer" style={{ opacity: 0.04 }} />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <span className="display-type text-[1.375rem] leading-tight tracking-[-0.025em] text-paper">
            {name || "Your shop"}
          </span>
          <span
            aria-hidden
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-stamp"
            style={{ opacity: paused ? 0.3 : 1, boxShadow: paused ? "none" : "0 0 14px rgba(255,90,44,0.75)" }}
          />
        </div>

        <p className="mt-1.5 text-[0.9375rem] text-paper/65">{rewardText || ruleLine}</p>

        <div className="mt-4">
          {slots === null ? (
            <span className="font-mono text-[2rem] leading-none text-paper">
              {percent === null ? "0" : String(percent).replace(/\.0+$/, "")}%
              <span className="ml-2 text-sm text-paper/55">back in NIM</span>
            </span>
          ) : (
            <StampRow filled={0} slots={slots} />
          )}
        </div>

        <Perforation className="mt-5 mb-3 text-paper" />

        <div className="flex items-center justify-between gap-3">
          <span className="label-type text-paper/50">{ruleLine}</span>
          <span className="label-type shrink-0 text-paper/35">
            {code ? code : `from ${formatNim(minLuna)} NIM`}
          </span>
        </div>
      </div>
    </div>
  );
}
