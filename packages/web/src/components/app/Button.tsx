"use client";

import type { ReactNode } from "react";
import Link from "next/link";

type Tone = "primary" | "stamp" | "ghost";

const base =
  "group inline-flex w-full items-center justify-center gap-2.5 rounded-[8px] px-5 py-3.5 text-[0.9375rem] font-medium transition-[transform,box-shadow,background-color,border-color] duration-300 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0";

const tones: Record<Tone, string> = {
  primary:
    "bg-paper text-ink hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_34px_-18px_rgba(243,239,230,0.5)]",
  stamp:
    "bg-stamp text-ink hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-16px_rgba(255,90,44,0.65)]",
  ghost:
    "border border-line bg-transparent text-paper/85 hover:-translate-y-0.5 hover:border-paper/35 hover:text-paper",
};

type ButtonProps = {
  children: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
};

export function Button({ children, tone = "primary", onClick, disabled, type = "button" }: ButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${tones[tone]}`}>
      {children}
    </button>
  );
}

type ButtonLinkProps = {
  children: ReactNode;
  href: string;
  tone?: Tone;
  external?: boolean;
};

export function ButtonLink({ children, href, tone = "primary", external = false }: ButtonLinkProps) {
  if (external) {
    return (
      <a href={href} className={`${base} ${tones[tone]}`}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={`${base} ${tones[tone]}`}>
      {children}
    </Link>
  );
}

/** The arrow that slides on hover, so a call to action never sits still under a finger. */
export function Arrow() {
  return (
    <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
      &rarr;
    </span>
  );
}
