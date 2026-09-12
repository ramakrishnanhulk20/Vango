/**
 * What sits around the phone column. On a phone it is only the stamp glow behind the
 * first card; on a desktop it is the poster the shell stands on, so the app never reads
 * as a bare form in the middle of a white page.
 */
export default function AppBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 70% at 50% -14%, rgba(243,239,230,0.13) 0%, rgba(243,239,230,0.04) 30%, transparent 60%)",
        }}
      />
      <div
        className="absolute left-1/2 top-[-12%] h-[52vh] w-[52vh] -translate-x-1/2 rounded-full opacity-70 blur-[80px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,90,44,0.26) 0%, rgba(255,90,44,0.08) 50%, transparent 76%)",
        }}
      />
      <div
        className="absolute inset-0 hidden lg:block"
        style={{
          background: "radial-gradient(70% 60% at 92% 88%, rgba(78,108,160,0.20) 0%, transparent 62%)",
        }}
      />
      <span
        className="display-type absolute bottom-[-4vh] left-[-1vw] hidden select-none text-paper/[0.035] lg:block"
        style={{ fontSize: "26vw", letterSpacing: "-0.05em", lineHeight: 0.8 }}
      >
        Vango
      </span>
      <div
        className="absolute inset-x-0 bottom-0 h-[55%]"
        style={{
          background: "linear-gradient(to top, var(--ink) 12%, rgba(11,15,26,0.55) 55%, transparent 100%)",
        }}
      />
      <div className="grain-layer" />
    </div>
  );
}
