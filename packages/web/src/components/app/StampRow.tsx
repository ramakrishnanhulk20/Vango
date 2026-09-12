"use client";

import { motion, useReducedMotion } from "framer-motion";

type StampRowProps = {
  filled: number;
  slots: number;
  size?: "sm" | "md";
};

/**
 * The stamp circles off the card in the hero, at the size a list row can carry. Only
 * the last inked slot glows, so a card that just moved reads at a glance.
 */
export default function StampRow({ filled, slots, size = "sm" }: StampRowProps) {
  const reduced = useReducedMotion();
  const box = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const inner = size === "sm" ? "inset-[2px]" : "inset-[3px]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: slots }).map((_, index) => {
        const on = index < filled;
        const latest = index === filled - 1;
        return (
          <div key={index} className={`relative ${box} rounded-full border border-line`}>
            <motion.span
              aria-hidden
              className={`absolute ${inner} rounded-full bg-stamp`}
              initial={false}
              animate={{ scale: on ? 1 : 0, opacity: on ? (latest ? 1 : 0.8) : 0 }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 13 }}
              style={latest ? { boxShadow: "0 0 16px rgba(255,90,44,0.5)" } : undefined}
            />
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="absolute inset-0 h-full w-full"
              style={{ opacity: on ? 0.28 : 0 }}
            >
              <path
                d="M12 6.5v11M6.5 12h11M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6"
                stroke="#0b0f1a"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
