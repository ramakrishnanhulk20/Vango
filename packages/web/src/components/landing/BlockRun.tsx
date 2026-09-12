import type { CSSProperties } from "react";
import styles from "./BlockRun.module.css";

const COUNT = 11;
const TARGET = 6;

type BlockVars = CSSProperties & { "--i": number };

export default function BlockRun() {
  return (
    <div data-blocks className={`${styles.run} relative w-full`}>
      <div aria-hidden className="relative h-px w-full">
        <div className="absolute inset-0 bg-line" />
        <div
          className={`${styles.rail} absolute inset-0`}
          style={{
            background:
              "linear-gradient(90deg, rgba(255,90,44,0.25) 0%, var(--stamp) 70%, rgba(255,90,44,0.9) 100%)",
          }}
        />
      </div>

      <div aria-hidden className="mt-4 flex w-full items-end gap-[2px] sm:gap-1.5">
        {Array.from({ length: COUNT }).map((_, i) => {
          const isTarget = i === TARGET;
          return (
            <div
              key={i}
              className={`${styles.block} relative flex-1 overflow-hidden rounded-[4px] border`}
              style={
                {
                  "--i": i,
                  height: isTarget ? "4.5rem" : "3rem",
                  borderColor: isTarget ? "rgba(255,90,44,0.55)" : "var(--line)",
                  background:
                    "linear-gradient(170deg, rgba(243,239,230,0.09) 0%, rgba(243,239,230,0.02) 60%, transparent 100%)",
                  boxShadow: isTarget
                    ? "0 0 34px -6px rgba(255,90,44,0.55)"
                    : "0 1px 0 0 rgba(243,239,230,0.06) inset",
                } as BlockVars
              }
            >
              {isTarget && (
                <div
                  className={`${styles.fill} absolute inset-0`}
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(255,90,44,0.95) 0%, rgba(255,90,44,0.55) 100%)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex w-full gap-[2px] sm:gap-1.5">
        {Array.from({ length: COUNT }).map((_, i) => (
          <div key={i} className="relative flex-1">
            {i === TARGET && (
              <div
                className={`${styles.tag} absolute left-1/2 top-0 -translate-x-1/2`}
                style={{ "--i": TARGET } as BlockVars}
              >
                <span aria-hidden className="mx-auto block h-4 w-px bg-stamp/70" />
                <span className="label-type mt-2 block whitespace-nowrap text-stamp">
                  included
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
