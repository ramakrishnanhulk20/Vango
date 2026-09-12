import Grain from "./Grain";

const SLOTS = 5;
const INKED = 2;

// Drawn art of a merchant card, not a live card, so it stays out of the reading
// order and no number on it is presented as data.
export default function MerchantCardArt() {
  return (
    <div aria-hidden className="relative">
      <div
        className="pointer-events-none absolute -inset-24 rounded-full opacity-80 blur-[100px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,90,44,0.22), rgba(255,90,44,0.04) 62%, transparent)",
        }}
      />

      <div
        className="absolute left-[7%] top-[9%] h-full w-full rounded-[20px] border border-line opacity-40"
        style={{
          transform: "rotate(9.5deg)",
          background: "linear-gradient(160deg, #161d2c 0%, #0d121d 100%)",
        }}
      />

      <div
        className="relative w-[clamp(296px,46vw,640px)] rotate-[6.5deg] overflow-hidden rounded-[20px] border border-line transition-[rotate,translate] duration-700 ease-out group-hover:-translate-y-2 group-hover:rotate-[4.5deg]"
        style={{
          aspectRatio: "320 / 200",
          background: "linear-gradient(158deg, #1e2637 0%, #121826 44%, #0b1018 100%)",
          boxShadow:
            "0 70px 120px -46px rgba(0,0,0,0.95), 0 2px 0 0 rgba(243,239,230,0.08) inset",
        }}
      >
        <div
          className="pointer-events-none absolute -left-1/4 -top-1/2 h-[170%] w-[170%] opacity-70"
          style={{
            background:
              "linear-gradient(112deg, rgba(243,239,230,0.13) 0%, rgba(243,239,230,0) 40%)",
          }}
        />
        <Grain opacity={0.05} />

        <div className="relative flex h-full flex-col justify-between p-[6%]">
          <div className="flex items-start justify-between">
            <div>
              <span className="label-type text-[0.625rem] text-paper/40">Loyalty card</span>
              <span
                className="display-type mt-2 block leading-none tracking-[-0.03em] text-paper"
                style={{ fontSize: "clamp(1.5rem, 3.4vw, 2.75rem)" }}
              >
                Demo Cafe
              </span>
            </div>
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full bg-stamp"
              style={{ boxShadow: "0 0 16px rgba(255,90,44,0.75)" }}
            />
          </div>

          <div className="flex items-center gap-[3%]">
            {Array.from({ length: SLOTS }).map((_, i) => (
              <div
                key={i}
                className="relative aspect-square w-[11%] rounded-full border border-line"
              >
                {i < INKED && (
                  <span
                    className="absolute inset-[12%] rounded-full bg-stamp opacity-90"
                    style={{ boxShadow: "0 0 18px rgba(255,90,44,0.45)" }}
                  />
                )}
              </div>
            ))}
          </div>

          <div>
            <svg
              viewBox="0 0 280 2"
              preserveAspectRatio="none"
              className="mb-[3%] h-px w-full"
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
            <span className="label-type block text-[0.625rem] tracking-[0.18em] text-paper/50">
              stamped by the chain
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
