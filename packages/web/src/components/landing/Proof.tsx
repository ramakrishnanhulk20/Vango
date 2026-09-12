"use client";

import { motion, useReducedMotion } from "framer-motion";
import Grain from "./Grain";

const EASE = [0.16, 1, 0.3, 1] as const;

const FACTS = [
  {
    statement: "Every stamp is a transaction on the Nimiq chain",
    label: "Memo vango:CODE on a NIM payment",
    indent: "lg:col-start-1",
  },
  {
    statement: "Redeeming is a signature only your wallet can make",
    label: "Signed in Nimiq Pay, checked by the server",
    indent: "lg:col-start-3",
  },
  {
    statement: "Vango never holds your money",
    label: "Payments go wallet to wallet",
    indent: "lg:col-start-5",
  },
];

export default function Proof() {
  const reduced = useReducedMotion();

  const reveal = (delay: number) => ({
    initial: { opacity: 0, y: 26 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.5 },
    transition: reduced ? { duration: 0 } : { duration: 0.75, delay, ease: EASE },
  });

  return (
    <section
      className="relative w-full overflow-hidden py-28 lg:py-40"
      style={{ background: "linear-gradient(180deg, #05070d 0%, #080b13 60%, #0b0f1a 100%)" }}
      aria-label="What holds Vango up"
    >
      <Grain opacity={0.07} />

      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-line" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-line" />

      {/* The stamp ring is the mark that repeats across the site, here blown up and
          running off the right edge. */}
      <svg
        aria-hidden
        viewBox="0 0 200 200"
        className="pointer-events-none absolute -right-[16%] top-[6%] h-[42rem] w-[42rem] opacity-[0.07]"
      >
        <circle cx="100" cy="100" r="96" fill="none" stroke="var(--stamp)" strokeWidth="0.6" />
        <circle
          cx="100"
          cy="100"
          r="72"
          fill="none"
          stroke="var(--stamp)"
          strokeWidth="0.6"
          strokeDasharray="3 4"
        />
        <circle cx="100" cy="100" r="44" fill="none" stroke="var(--paper)" strokeWidth="0.4" />
        <path
          d="M100 76v48M76 100h48M84 84l32 32M116 84l-32 32"
          stroke="var(--stamp)"
          strokeWidth="0.8"
        />
      </svg>

      <div className="relative mx-auto w-full max-w-[1440px] px-6 md:px-12">
        <motion.span {...reveal(0)} className="label-type block text-paper/35">
          What holds it up
        </motion.span>

        <div className="mt-14 grid grid-cols-1 gap-0 lg:grid-cols-12">
          {FACTS.map((fact, i) => (
            <motion.div
              key={fact.statement}
              {...reveal(0.06 + i * 0.1)}
              className={`group relative border-t border-line py-9 lg:col-span-8 ${fact.indent}`}
            >
              <span
                aria-hidden
                className="absolute left-0 top-0 h-px w-0 bg-stamp transition-all duration-700 ease-out group-hover:w-full"
              />
              <h3
                className="display-type max-w-[30ch] text-paper/85 transition-colors duration-500 group-hover:text-paper"
                style={{
                  fontSize: "clamp(1.5rem, 3.2vw, 2.75rem)",
                  letterSpacing: "-0.025em",
                  lineHeight: 1.06,
                }}
              >
                {fact.statement}
              </h3>
              <span className="label-type mt-5 block text-paper/40 transition-colors duration-500 group-hover:text-stamp">
                {fact.label}
              </span>
            </motion.div>
          ))}
        </div>

        <motion.div {...reveal(0.3)} className="mt-16 lg:ml-[33.333%]">
          <a
            href="/docs"
            className="group relative inline-flex items-center gap-2.5 rounded-[8px] border border-line px-6 py-3.5 text-[0.9375rem] text-paper/80 transition-colors duration-300 hover:border-paper/40 hover:text-paper"
          >
            Read the architecture
            <span
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              &rarr;
            </span>
            <span
              aria-hidden
              className="absolute bottom-2.5 left-6 right-6 h-px origin-left scale-x-0 bg-paper/45 transition-transform duration-300 group-hover:scale-x-100"
            />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
