// Drawn art, not a live screen: this is the Nimiq Pay confirm sheet a customer sees
// when they pay the shop, so the whole frame is hidden from screen readers and the
// copy beside it carries the meaning.
export default function PhoneConfirm() {
  return (
    <div
      aria-hidden
      className="relative w-[clamp(224px,26vw,296px)]"
      style={{ aspectRatio: "296 / 600" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-12 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,90,44,0.22), rgba(255,90,44,0.04) 62%, transparent)",
        }}
      />

      <div
        className="relative h-full w-full overflow-hidden rounded-[34px] border border-line p-[6px]"
        style={{
          background: "linear-gradient(155deg, #232b3d 0%, #121826 38%, #0a0e18 100%)",
          boxShadow:
            "0 60px 110px -40px rgba(0,0,0,0.95), 0 1px 0 0 rgba(243,239,230,0.10) inset",
        }}
      >
        <div
          className="relative h-full w-full overflow-hidden rounded-[28px]"
          style={{ background: "linear-gradient(180deg, #0f1421 0%, #0b0f1a 100%)" }}
        >
          <div
            className="pointer-events-none absolute -left-1/3 -top-1/3 h-[140%] w-[140%] opacity-70"
            style={{
              background:
                "linear-gradient(118deg, rgba(243,239,230,0.12) 0%, rgba(243,239,230,0) 34%)",
            }}
          />

          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between px-5 pt-4">
              <span className="label-type text-[0.5625rem] text-paper/45">Nimiq Pay</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-4 rounded-full bg-paper/25" />
                <span className="h-2 w-3.5 rounded-[2px] border border-paper/25" />
              </span>
            </div>

            <div className="mt-auto rounded-t-[22px] border-t border-line bg-[#111827]/70 px-5 pb-5 pt-5 backdrop-blur-sm">
              <span className="label-type text-[0.5625rem] text-stamp">Confirm payment</span>

              <div className="mt-4 flex items-baseline gap-2">
                <span
                  className="display-type leading-none text-paper"
                  style={{ fontSize: "2.5rem", letterSpacing: "-0.03em" }}
                >
                  1
                </span>
                <span className="label-type text-paper/60">NIM</span>
              </div>

              <div className="mt-4 space-y-2.5 border-t border-line pt-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="label-type text-[0.5625rem] text-paper/35">To</span>
                  <span className="text-[0.8125rem] text-paper/85">Demo Cafe</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="label-type text-[0.5625rem] text-paper/35">Memo</span>
                  <span className="label-type text-[0.5625rem] normal-case tracking-[0.08em] text-paper/85">
                    vango:CODE
                  </span>
                </div>
              </div>

              <div className="mt-5 flex h-11 w-full items-center justify-center rounded-[8px] bg-stamp text-[0.875rem] font-medium text-ink">
                Approve
              </div>
              <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-paper/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
