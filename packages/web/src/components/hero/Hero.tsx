"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import PosterBackdrop from "./PosterBackdrop";
import StampCard from "./StampCard";

const META = ["Loyalty card", "Lives in your wallet", "Stamped by the chain"];

const EASE = [0.16, 1, 0.3, 1] as const;

// The block this card was stamped in on the Nimiq testnet, from the proof run.
const PROOF_BLOCK = 11222943;

const OPEN_IN_PAY = "https://nimpay.app/miniapps/open/vango.app";

type HeroProps = {
  loopStamp?: boolean;
};

export default function Hero({ loopStamp = false }: HeroProps) {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = root.current;
    if (!el) return;

    gsap.registerPlugin(ScrollTrigger);

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom top",
      onUpdate: (self) => {
        el.style.setProperty("--hero-scroll", self.progress.toFixed(4));
      },
    });

    return () => trigger.kill();
  }, [reduced]);

  // The initial state is the same on the server and the client so hydration never
  // mismatches. Reduced motion drops the duration instead of the animation.
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: reduced ? { duration: 0 } : { duration: 0.7, delay, ease: EASE },
  });

  return (
    <section
      ref={root}
      className="relative min-h-[100svh] w-full overflow-hidden bg-ink pb-[40svh]"
    >
      <PosterBackdrop />

      <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[1440px] flex-col px-6 pb-12 pt-7 md:px-12 md:pb-16">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.9, delay: 0.05 }}
          className="flex items-center justify-between"
        >
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-stamp" />
            <span className="label-type text-paper/70">Vango</span>
          </span>
          <span className="label-type text-right text-paper/45">
            A Nimiq Pay mini app
          </span>
        </motion.div>

        <div className="flex flex-1 flex-col justify-end">
          <div className="flex flex-col-reverse md:flex-col">
            <div className="parallax-still mt-12 flex justify-center md:mt-0 md:-mb-[3.5rem] md:justify-start md:pl-[44%] lg:pl-[46%]">
              <StampCard
                stampIndex={3}
                blockNumber={PROOF_BLOCK}
                loop={loopStamp}
                entranceDelay={0.3}
              />
            </div>

            <div className="parallax-title relative z-10">
              <motion.h1
                {...rise(0.1)}
                className="display-type text-paper"
                style={{
                  fontSize: "clamp(4rem, 14vw, 12rem)",
                  letterSpacing: "-0.04em",
                  lineHeight: 0.9,
                }}
              >
                Vango
              </motion.h1>

              <motion.ul
                {...rise(0.22)}
                className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-5"
              >
                {META.map((item, i) => (
                  <li key={item} className="flex items-center gap-3 sm:gap-5">
                    {i > 0 && (
                      <span aria-hidden className="hidden h-3.5 w-px bg-line sm:block" />
                    )}
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-stamp" />
                      <span className="label-type text-paper/70">{item}</span>
                    </span>
                  </li>
                ))}
              </motion.ul>

              <motion.p
                {...rise(0.34)}
                className="mt-7 max-w-[54ch] text-[1.0625rem] leading-relaxed text-paper/75 sm:text-lg"
              >
                Pay the shop in NIM. The stamp lands by{" "}
                <span className="text-stamp">itself</span>.
              </motion.p>

              <motion.div
                {...rise(0.46)}
                className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <a
                  href={OPEN_IN_PAY}
                  className="group inline-flex w-full items-center justify-center gap-2.5 rounded-[8px] bg-paper px-6 py-3.5 text-[0.9375rem] font-medium text-ink transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_40px_-18px_rgba(243,239,230,0.55)] sm:w-auto"
                >
                  Open in Nimiq Pay
                  <span
                    aria-hidden
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  >
                    &rarr;
                  </span>
                </a>
                <a
                  href="#how"
                  className="group relative inline-flex w-full items-center justify-center rounded-[8px] border border-line px-6 py-3.5 text-[0.9375rem] text-paper/80 transition-colors duration-300 hover:border-paper/40 hover:text-paper sm:w-auto"
                >
                  How it works
                  <span
                    aria-hidden
                    className="absolute bottom-2.5 left-6 right-6 h-px origin-left scale-x-0 bg-paper/45 transition-transform duration-300 group-hover:scale-x-100"
                  />
                </a>
              </motion.div>
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.8, delay: 1.1 }}
          className="pointer-events-none mt-10 hidden items-center gap-3 md:flex"
        >
          <span className="label-type text-paper/35">Scroll</span>
          <span aria-hidden className="h-px w-16 bg-line" />
        </motion.div>
      </div>
    </section>
  );
}
