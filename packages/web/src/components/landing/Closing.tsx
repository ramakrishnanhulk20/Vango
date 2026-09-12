"use client";

import { motion, useReducedMotion } from "framer-motion";
import Grain from "./Grain";

const EASE = [0.16, 1, 0.3, 1] as const;

const OPEN_IN_PAY = "https://nimpay.app/miniapps/open/vango-card.vercel.app";

export default function Closing() {
  const reduced = useReducedMotion();

  const reveal = (delay: number) => ({
    initial: { opacity: 0, y: 26 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.4 },
    transition: reduced ? { duration: 0 } : { duration: 0.8, delay, ease: EASE },
  });

  return (
    <footer className="relative w-full overflow-hidden bg-ink pb-8 pt-32 lg:pt-48">
      <Grain opacity={0.06} />

      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-30%] left-1/2 h-[70vh] w-[110vw] -translate-x-1/2 rounded-full opacity-80 blur-[130px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,90,44,0.20) 0%, rgba(255,90,44,0.05) 46%, transparent 74%)",
        }}
      />

      {/* The poster margin: a thin printed rule around the whole closing frame. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-3 border border-line md:inset-6"
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-6 md:px-12">
        <motion.span
          {...reveal(0)}
          className="label-type block text-stamp"
          style={{ fontSize: "0.8125rem" }}
        >
          Come in.
        </motion.span>

        <div className="relative mt-6">
          <motion.h2
            initial={{ opacity: 0, y: reduced ? 0 : 40 }}
            whileInView={{ opacity: 0.14, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={reduced ? { duration: 0 } : { duration: 1.1, ease: EASE }}
            className="display-type -ml-[0.05em] whitespace-nowrap text-paper"
            style={{
              fontSize: "clamp(4rem, 14vw, 12rem)",
              letterSpacing: "-0.045em",
              lineHeight: 0.9,
            }}
          >
            Vango
          </motion.h2>

          <div className="mt-7 flex md:absolute md:inset-0 md:mt-0 md:items-center">
            <motion.a
              {...reveal(0.22)}
              href={OPEN_IN_PAY}
              className="group inline-flex items-center justify-center gap-2.5 rounded-[8px] bg-paper px-6 py-3.5 text-[0.9375rem] font-medium text-ink transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_40px_-18px_rgba(243,239,230,0.55)] md:ml-[8%]"
            >
              Open in Nimiq Pay
              <span
                aria-hidden
                className="transition-transform duration-300 group-hover:translate-x-1"
              >
                &rarr;
              </span>
            </motion.a>
          </div>
        </div>

        <motion.div
          {...reveal(0.3)}
          className="mt-24 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="label-type text-paper/40">
            Built on Nimiq Pay. Open source, MIT.
          </span>
          <span className="flex items-center gap-7">
            {/* SWAP: the public repo URL once the project is pushed. */}
            <a
              href="#"
              className="label-type group relative text-paper/55 transition-colors duration-300 hover:text-paper"
            >
              GitHub
              <span
                aria-hidden
                className="absolute -bottom-1.5 left-0 right-0 h-px origin-left scale-x-0 bg-stamp transition-transform duration-300 group-hover:scale-x-100"
              />
            </a>
            <a
              href="/docs"
              className="label-type group relative text-paper/55 transition-colors duration-300 hover:text-paper"
            >
              Docs
              <span
                aria-hidden
                className="absolute -bottom-1.5 left-0 right-0 h-px origin-left scale-x-0 bg-stamp transition-transform duration-300 group-hover:scale-x-100"
              />
            </a>
          </span>
        </motion.div>
      </div>
    </footer>
  );
}
