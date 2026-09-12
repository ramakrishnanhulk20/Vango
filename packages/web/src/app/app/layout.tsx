import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import AppBackdrop from "@/components/app/AppBackdrop";
import ConnectGate from "@/components/app/ConnectGate";

export const metadata: Metadata = {
  title: "Vango",
  description: "Your loyalty cards, stamped by the chain, inside Nimiq Pay.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f1a",
};

// Runs before the screen below it is parsed, so the first paint is already the right
// one: no "open me in Nimiq Pay" flashing at somebody who is inside it.
const markHost =
  "(function(){var s=document.currentScript;if(s&&s.parentElement&&(window.nimiqPay||window.nimiq))s.parentElement.dataset.inPay='1'})()";

// The Pay WebView has no console a person can read. A script that dies before the
// gate runs would leave the first label on screen forever, so the failure is printed
// where the person is looking.
const surfaceErrors =
  "(function(){function show(m){var b=document.getElementById('vango-fault');if(!b){b=document.createElement('pre');b.id='vango-fault';b.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;padding:10px 12px;border-radius:8px;background:rgba(255,77,109,0.12);color:#ff4d6d;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all';document.body.appendChild(b)}b.textContent+=m+'\n'}window.addEventListener('error',function(e){show('error: '+(e.message||e.type))});window.addEventListener('unhandledrejection',function(e){show('rejection: '+((e.reason&&e.reason.message)||e.reason))})})()";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const host = (await headers()).get("host") ?? "vango.app";

  return (
    <div className="pay-shell relative min-h-[100svh] w-full overflow-x-hidden" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: markHost }} />
      <script dangerouslySetInnerHTML={{ __html: surfaceErrors }} />
      <AppBackdrop />

      <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col px-5 pb-10 pt-5 sm:px-6 lg:border-x lg:border-line">
        <header className="flex items-center justify-between">
          <Link href="/app" className="group flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full bg-stamp transition-transform duration-300 group-hover:scale-150"
              style={{ boxShadow: "0 0 12px rgba(255,90,44,0.7)" }}
            />
            <span className="label-type text-paper/70 transition-colors duration-300 group-hover:text-paper">
              Vango
            </span>
          </Link>
          <span className="label-type text-paper/35">Nimiq Pay</span>
        </header>

        <ConnectGate host={host}>{children}</ConnectGate>
      </div>
    </div>
  );
}
