export default function PosterBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* SWAP: hero still. A real photograph of a stamped card on a cafe counter goes
          here as a full-bleed next/image under the scrim and the grain. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 8% -10%, rgba(243,239,230,0.16) 0%, rgba(243,239,230,0.05) 26%, transparent 58%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(85% 70% at 96% 6%, rgba(78,108,160,0.18) 0%, transparent 62%)",
        }}
      />

      <div
        className="parallax-still absolute left-[30%] top-[6%] h-[62vh] w-[62vh] rounded-full opacity-80 blur-[90px] sm:left-[40%]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,90,44,0.34) 0%, rgba(255,90,44,0.10) 52%, transparent 76%)",
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 h-[80%]"
        style={{
          background:
            "linear-gradient(to top, var(--ink) 8%, rgba(11,15,26,0.86) 34%, rgba(11,15,26,0.35) 64%, transparent 100%)",
        }}
      />

      <div
        className="absolute inset-x-0 top-0 h-40"
        style={{
          background: "linear-gradient(to bottom, rgba(11,15,26,0.75), transparent)",
        }}
      />

      <div className="grain-layer" />
    </div>
  );
}
