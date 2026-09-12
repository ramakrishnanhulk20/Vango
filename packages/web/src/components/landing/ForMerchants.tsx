"use client";

import { motion, useReducedMotion } from "framer-motion";
import MerchantCardArt from "./MerchantCardArt";
import Section from "./Section";

const EASE = [0.16, 1, 0.3, 1] as const;

const LINES = [
  "Pick a rule, name the shop, and the card is live. Your customers install nothing new. If they carry Nimiq Pay, they already carry your card.",
  "No middleman sits in the payment. No fee on top of it. Every NIM a customer sends lands in your wallet, and Vango never touches it.",
  "A stamp is a real payment on a public chain, so nobody can fake one. Any card can be checked against the chain by anyone.",
];

const CHIPS = ["Every 5th coffee free", "2% back in NIM"];

export default function ForMerchants() {
  const reduced = useReducedMotion();

  const reveal = (delay: number) => ({
    initial: { opacity: 0, y: 26 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.4 },
    transition: reduced ? { duration: 0 } : { duration: 0.75, delay, ease: EASE },
  });

  return (
    <Section className="py-28 lg:py-44" grain={0.055}>
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10%] top-[10%] h-[60vh] w-[60vh] rounded-full opacity-70 blur-[120px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(243,239,230,0.10) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-16 px-6 md:px-12 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5 lg:col-start-1">
          <motion.div {...reveal(0)}>
            <span className="label-type text-stamp">For merchants</span>
            <h2
              className="display-type mt-6 text-paper"
              style={{
                fontSize: "clamp(2.5rem, 6.4vw, 5.25rem)",
                letterSpacing: "-0.04em",
                lineHeight: 0.94,
              }}
            >
              A card in
              <br />
              two taps.
            </h2>
          </motion.div>

          <div className="mt-9 space-y-5">
            {LINES.map((line, i) => (
              <motion.p
                key={line}
                {...reveal(0.08 + i * 0.08)}
                className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-paper/70"
              >
                {line}
              </motion.p>
            ))}
          </div>

          <motion.div {...reveal(0.34)} className="mt-10">
            <span className="label-type text-paper/35">Rules you can pick</span>
            <div className="mt-4 flex flex-wrap gap-3">
              {CHIPS.map((chip) => (
                <span
                  key={chip}
                  className="group/chip inline-flex items-center gap-2.5 rounded-[8px] border border-line px-4 py-2.5 text-[0.875rem] text-paper/80 transition-colors duration-300 hover:border-stamp/50 hover:text-paper"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-stamp transition-transform duration-300 group-hover/chip:scale-150"
                  />
                  {chip}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div {...reveal(0.42)} className="mt-11">
            <a
              href="/app/merchant/new"
              className="group inline-flex items-center justify-center gap-2.5 rounded-[8px] bg-paper px-6 py-3.5 text-[0.9375rem] font-medium text-ink transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_40px_-18px_rgba(243,239,230,0.55)]"
            >
              Create a card
              <span
                aria-hidden
                className="transition-transform duration-300 group-hover:translate-x-1"
              >
                &rarr;
              </span>
            </a>
          </motion.div>
        </div>

        {/* The card runs past the right edge of the grid. The section clips it, so
            there is never a sideways scrollbar. */}
        <div className="group flex justify-center lg:col-span-7 lg:col-start-6 lg:translate-x-[12%] lg:justify-start xl:translate-x-[16%]">
          <motion.div
            initial={{ opacity: 0, y: 44 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={reduced ? { duration: 0 } : { duration: 1, delay: 0.1, ease: EASE }}
          >
            <MerchantCardArt />
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
