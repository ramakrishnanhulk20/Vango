"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Reveal from "@/components/app/Reveal";

const link =
  "label-type text-paper/40 transition-colors duration-300 hover:text-paper";

/**
 * The counter's own thin rail. It carries the way into the create form, which the
 * wallet home page has no slot for.
 */
export default function MerchantNav() {
  const pathname = usePathname();

  return (
    <Reveal>
      <nav className="flex items-center justify-between gap-4 pt-8">
        <Link href="/app" className={`group inline-flex items-center gap-2 ${link}`}>
          <span aria-hidden className="transition-transform duration-300 group-hover:-translate-x-1">
            &larr;
          </span>
          Your cards
        </Link>
        {pathname === "/app/merchant/new" ? (
          <span className="label-type text-paper/25">New card</span>
        ) : (
          <Link
            href="/app/merchant/new"
            className={`${link} underline decoration-paper/20 underline-offset-4 hover:decoration-stamp`}
          >
            Create a card
          </Link>
        )}
      </nav>
    </Reveal>
  );
}
