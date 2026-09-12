"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import StampCard from "@/components/hero/StampCard";
import BlockRun from "./BlockRun";
import Grain from "./Grain";
import PhoneConfirm from "./PhoneConfirm";
import styles from "./HowItWorks.module.css";

const EASE = [0.16, 1, 0.3, 1] as const;

const PIN_QUERY = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";
const FLOW_QUERY = "(max-width: 1023px) and (prefers-reduced-motion: no-preference)";
const STILL_QUERY = "(prefers-reduced-motion: reduce)";

// The block the proof run stamped this card in on the Nimiq testnet.
const PROOF_BLOCK = 11222943;

const BEATS = [
  {
    label: "01",
    title: "Pay the shop",
    body: "The customer sends 1 NIM to your wallet from Nimiq Pay. The memo carries the card code, nothing else.",
  },
  {
    label: "02",
    title: "The chain confirms it",
    body: "Vango watches the chain for that payment. Once it sits in a block, it is final and public.",
  },
  {
    label: "03",
    title: "The stamp lands by itself",
    body: "The card gains a stamp with the block it came from. No paper card, no scanner, no staff tapping anything.",
  },
];

const HEAD_STYLE = {
  fontSize: "clamp(2.5rem, 7vw, 6rem)",
  letterSpacing: "-0.035em",
  lineHeight: 0.92,
} as const;

export default function HowItWorks() {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const stampSlot = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const [pinned, setPinned] = useState(false);
  const [active, setActive] = useState(0);
  const [inking, setInking] = useState(false);

  // In the pinned stack the third beat sits in the viewport from the start, so the
  // card waits for its beat instead of for the element being on screen.
  const slotInView = useInView(stampSlot, { once: true, amount: 0.4 });
  const armed = pinned ? inking : slotInView;

  useEffect(() => {
    const el = root.current;
    const pinTarget = frame.current;
    if (!el || !pinTarget) return;

    gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia();
    const beat = (i: number) => el.querySelector(`[data-beat="${i}"]`) as HTMLElement;
    const part = (i: number, name: string) =>
      beat(i).querySelector(`[data-${name}]`) as HTMLElement;
    const blocks = () => el.querySelector("[data-blocks]") as HTMLElement | null;

    mm.add(PIN_QUERY, () => {
      setPinned(true);
      const run = { v: 0 };
      const writeRun = () => blocks()?.style.setProperty("--bp", run.v.toFixed(4));

      gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          trigger: pinTarget,
          start: "top top",
          end: "+=200%",
          pin: true,
          anticipatePin: 1,
          scrub: 0.5,
          onUpdate: (self) => {
            el.style.setProperty("--how", self.progress.toFixed(4));
            const next = self.progress < 0.3 ? 0 : self.progress < 0.64 ? 1 : 2;
            setActive(next);
            if (next === 2) setInking(true);
          },
        },
      })
        .addLabel("cut1", 2)
        .to(beat(0), { opacity: 0, duration: 1.1 }, "cut1")
        .to(part(0, "head"), { xPercent: -9, duration: 1.1 }, "cut1")
        .to(part(0, "art"), { yPercent: 8, opacity: 0, duration: 1.1 }, "cut1")
        .fromTo(beat(1), { opacity: 0 }, { opacity: 1, duration: 1.1 }, "cut1+=0.3")
        .fromTo(
          part(1, "head"),
          { xPercent: 13 },
          { xPercent: 0, duration: 1.5, ease: "power3.out" },
          "cut1+=0.3",
        )
        .to(run, { v: 1, duration: 2.6, ease: "none", onUpdate: writeRun }, "cut1+=1.5")
        .addLabel("cut2", "cut1+=4.5")
        .to(beat(1), { opacity: 0, duration: 1.1 }, "cut2")
        .to(part(1, "head"), { xPercent: -9, duration: 1.1 }, "cut2")
        .fromTo(beat(2), { opacity: 0 }, { opacity: 1, duration: 1.1 }, "cut2+=0.3")
        .fromTo(
          part(2, "head"),
          { xPercent: 14 },
          { xPercent: 0, duration: 1.5, ease: "power3.out" },
          "cut2+=0.3",
        )
        .fromTo(
          part(2, "art"),
          { yPercent: 10, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 1.4, ease: "power3.out" },
          "cut2+=0.45",
        )
        .to({}, { duration: 2.2 }, "cut2+=1.7");

      return () => {
        setPinned(false);
        el.style.removeProperty("--how");
        blocks()?.style.removeProperty("--bp");
      };
    });

    mm.add(FLOW_QUERY, () => {
      const target = blocks();
      if (!target) return;
      const st = ScrollTrigger.create({
        trigger: target,
        start: "top 88%",
        end: "top 38%",
        onUpdate: (self) => target.style.setProperty("--bp", self.progress.toFixed(4)),
      });
      return () => {
        st.kill();
        target.style.removeProperty("--bp");
      };
    });

    mm.add(STILL_QUERY, () => {
      blocks()?.style.setProperty("--bp", "1");
    });

    return () => mm.revert();
  }, []);

  const reveal = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.35 },
    transition: reduced ? { duration: 0 } : { duration: 0.7, delay, ease: EASE },
  });

  return (
    <section
      id="how"
      className="relative w-full overflow-hidden bg-ink"
      aria-label="How Vango works"
    >
      <Grain opacity={0.05} />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(243,239,230,0.22) 22%, rgba(255,90,44,0.5) 52%, transparent)",
        }}
      />

      <div ref={root} className={styles.frame}>
        <div ref={frame} className={`${styles.stage} flex flex-col justify-center`}>
          <div
            aria-hidden
            className="pointer-events-none absolute right-[-14%] top-[-18%] h-[70vh] w-[70vh] rounded-full opacity-70 blur-[110px]"
            style={{
              background:
                "radial-gradient(closest-side, rgba(78,108,160,0.22) 0%, transparent 72%)",
            }}
          />

          <div
            aria-hidden
            className={`${styles.rail} pointer-events-none absolute right-6 top-1/2 z-20 -translate-y-1/2 flex-col items-end gap-5 md:right-10`}
          >
            <div className="relative mb-1 h-24 w-px bg-line">
              <div className={`${styles.railFill} absolute inset-0 bg-stamp`} />
            </div>
            {BEATS.map((b, i) => (
              <span
                key={b.label}
                className="label-type transition-colors duration-500"
                style={{ color: active === i ? "var(--stamp)" : "rgba(243,239,230,0.3)" }}
              >
                {b.label}
              </span>
            ))}
          </div>

          {BEATS.map((b, i) => (
            <div
              key={b.label}
              data-beat={i}
              className={`${styles.beat} flex w-full items-center py-24 lg:py-0`}
            >
              <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-12 px-6 md:px-12 lg:grid-cols-12 lg:gap-8">
                {i === 0 && (
                  <>
                    <motion.div {...reveal(0)} className="lg:col-span-5 lg:col-start-1">
                      <span className="label-type text-stamp">{b.label}</span>
                      <h2 data-head className="display-type mt-5 text-paper" style={HEAD_STYLE}>
                        {b.title}
                      </h2>
                      <p className="mt-6 max-w-[42ch] text-[1.0625rem] leading-relaxed text-paper/70">
                        {b.body}
                      </p>
                    </motion.div>
                    <motion.div
                      {...reveal(0.12)}
                      className="flex justify-center lg:col-span-5 lg:col-start-8 lg:translate-y-6 lg:justify-end"
                    >
                      {/* The offset lives on the parent because GSAP owns the
                          transform on the element it animates. */}
                      <div data-art>
                        <PhoneConfirm />
                      </div>
                    </motion.div>
                  </>
                )}

                {i === 1 && (
                  <div className="lg:col-span-12">
                    <div className="lg:flex lg:justify-end">
                      <motion.div {...reveal(0)} className="lg:w-[58%]">
                        <span className="label-type text-stamp">{b.label}</span>
                        <h2 data-head className="display-type mt-5 text-paper" style={HEAD_STYLE}>
                          {b.title}
                        </h2>
                        <p className="mt-6 max-w-[46ch] text-[1.0625rem] leading-relaxed text-paper/70">
                          {b.body}
                        </p>
                      </motion.div>
                    </div>
                    <div data-art className="relative mt-14 lg:mt-20">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -left-6 -right-6 top-0 h-px bg-line md:-left-12 md:-right-12"
                      />
                      <BlockRun />
                    </div>
                  </div>
                )}

                {i === 2 && (
                  <>
                    <motion.div
                      {...reveal(0)}
                      className="lg:col-span-6 lg:col-start-1 lg:row-start-1 lg:translate-y-10"
                    >
                      <span className="label-type text-stamp">{b.label}</span>
                      <h2 data-head className="display-type mt-5 text-paper" style={HEAD_STYLE}>
                        {b.title}
                      </h2>
                      <p className="mt-6 max-w-[42ch] text-[1.0625rem] leading-relaxed text-paper/70">
                        {b.body}
                      </p>
                    </motion.div>
                    <div
                      ref={stampSlot}
                      className="flex justify-center lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:-translate-y-12 lg:justify-end"
                    >
                      <div data-art>
                        {armed ? (
                          <StampCard
                            stampIndex={3}
                            blockNumber={PROOF_BLOCK}
                            entranceDelay={0.1}
                          />
                        ) : (
                          <div
                            aria-hidden
                            className="w-[272px] sm:w-[320px]"
                            style={{ aspectRatio: "320 / 200" }}
                          />
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
