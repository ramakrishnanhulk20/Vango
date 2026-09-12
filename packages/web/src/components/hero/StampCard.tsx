"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

type StampCardProps = {
  merchant?: string;
  slots?: number;
  stampIndex: number;
  blockNumber: number;
  loop?: boolean;
  entranceDelay?: number;
};

const TYPE_MS = 600;
const LOOP_MS = 6000;

export default function StampCard({
  merchant = "Demo Cafe",
  slots = 5,
  stampIndex,
  blockNumber,
  loop = false,
  entranceDelay = 0.45,
}: StampCardProps) {
  const footer = `block ${blockNumber}`;
  const reduced = useReducedMotion();

  const [inked, setInked] = useState(false);
  const [typed, setTyped] = useState(0);
  const [cycle, setCycle] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reduced) {
      setInked(true);
      setTyped(footer.length);
      return;
    }

    const clearTimers = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };

    const type = () => {
      const step = TYPE_MS / footer.length;
      for (let i = 1; i <= footer.length; i += 1) {
        timers.current.push(setTimeout(() => setTyped(i), step * i));
      }
    };

    const run = () => {
      setInked(true);
      setCycle((c) => c + 1);
      type();
    };

    const reset = () => {
      setInked(false);
      setTyped(0);
    };

    timers.current.push(setTimeout(run, entranceDelay * 1000 + 900));

    let loopTimer: ReturnType<typeof setInterval> | undefined;
    if (loop) {
      loopTimer = setInterval(() => {
        clearTimers();
        reset();
        timers.current.push(setTimeout(run, 700));
      }, LOOP_MS);
    }

    return () => {
      clearTimers();
      if (loopTimer) clearInterval(loopTimer);
    };
  }, [entranceDelay, footer.length, loop, reduced]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : { duration: 0.9, delay: entranceDelay, ease: [0.16, 1, 0.3, 1] }
      }
      className="relative"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-16 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,90,44,0.30), rgba(255,90,44,0.05) 60%, transparent)",
        }}
      />

      <motion.div
        animate={
          reduced || !inked
            ? { rotate: -6, scale: 1 }
            : { rotate: [-6, -5.2, -6.3, -6], scale: [1, 1.018, 0.998, 1] }
        }
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative w-[272px] sm:w-[320px]"
        style={{ aspectRatio: "320 / 200" }}
      >
        <div
          className="relative h-full w-full overflow-hidden rounded-[14px] border border-line"
          style={{
            background:
              "linear-gradient(158deg, #1b2233 0%, #121826 46%, #0d121d 100%)",
            boxShadow:
              "0 40px 80px -30px rgba(0,0,0,0.9), 0 2px 0 0 rgba(243,239,230,0.07) inset",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -left-1/4 -top-1/2 h-[160%] w-[160%] opacity-60"
            style={{
              background:
                "linear-gradient(112deg, rgba(243,239,230,0.14) 0%, rgba(243,239,230,0) 38%)",
            }}
          />
          <div aria-hidden className="grain-layer" style={{ opacity: 0.05 }} />

          <div className="relative flex h-full flex-col justify-between p-5">
            <div className="flex items-start justify-between">
              <span className="display-type text-[1.35rem] leading-none tracking-[-0.02em] text-paper">
                {merchant}
              </span>
              <span
                aria-hidden
                className="mt-1 h-2.5 w-2.5 rounded-full bg-stamp"
                style={{ boxShadow: "0 0 12px rgba(255,90,44,0.7)" }}
              />
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3">
              {Array.from({ length: slots }).map((_, i) => {
                const alreadyInked = i < stampIndex;
                const isTarget = i === stampIndex;
                const on = alreadyInked || (isTarget && inked);
                return (
                  <div
                    key={i}
                    className="relative h-8 w-8 rounded-full border border-line sm:h-9 sm:w-9"
                  >
                    {isTarget && inked && (
                      <motion.span
                        key={`bleed-${cycle}`}
                        aria-hidden
                        className="absolute inset-0 rounded-full"
                        style={{ boxShadow: "0 0 0 1px var(--stamp)" }}
                        initial={{ scale: 0.7, opacity: 0.8 }}
                        animate={{ scale: 2.1, opacity: 0 }}
                        transition={{ duration: 0.95, ease: "easeOut" }}
                      />
                    )}
                    <motion.span
                      aria-hidden
                      className="absolute inset-[3px] rounded-full bg-stamp"
                      initial={false}
                      animate={{
                        scale: on ? 1 : 0,
                        opacity: on ? (alreadyInked ? 0.82 : 1) : 0,
                      }}
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 430, damping: 11, mass: 0.6 }
                      }
                      style={
                        isTarget
                          ? { boxShadow: "0 0 22px rgba(255,90,44,0.55)" }
                          : undefined
                      }
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

            <div>
              <svg
                aria-hidden
                viewBox="0 0 280 2"
                preserveAspectRatio="none"
                className="mb-2.5 h-px w-full"
              >
                <line
                  x1="0"
                  y1="1"
                  x2="280"
                  y2="1"
                  stroke="var(--paper)"
                  strokeOpacity="0.18"
                  strokeWidth="2"
                  strokeDasharray="2 5"
                />
              </svg>
              <span className="label-type block text-[0.625rem] tracking-[0.18em] text-paper/55">
                {footer.slice(0, typed)}
                {typed < footer.length && (
                  <span className="caret text-stamp">_</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
