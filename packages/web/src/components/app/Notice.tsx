import type { ReactNode } from "react";
import Perforation from "./Perforation";
import Reveal from "./Reveal";

type NoticeProps = {
  label: string;
  title: string;
  children?: ReactNode;
  body?: string;
  tone?: "quiet" | "stamp" | "bad";
};

const dots: Record<"quiet" | "stamp" | "bad", string> = {
  quiet: "bg-paper/35",
  stamp: "bg-stamp",
  bad: "bg-bad",
};

/** One thing on the screen, said once, with whatever the customer does next under it. */
export default function Notice({ label, title, body, children, tone = "quiet" }: NoticeProps) {
  return (
    <div className="flex flex-1 flex-col justify-center py-10">
      <Reveal>
        <span className="flex items-center gap-2.5">
          <span aria-hidden className={`h-2 w-2 rounded-full ${dots[tone]}`} />
          <span className="label-type text-paper/55">{label}</span>
        </span>
      </Reveal>

      <Reveal delay={0.08}>
        <h1
          className="display-type mt-5 text-paper"
          style={{ fontSize: "clamp(2.25rem, 11vw, 3.25rem)", letterSpacing: "-0.035em", lineHeight: 0.95 }}
        >
          {title}
        </h1>
      </Reveal>

      {body && (
        <Reveal delay={0.16}>
          <p className="mt-5 max-w-[34ch] text-[1.0625rem] leading-relaxed text-paper/70">{body}</p>
        </Reveal>
      )}

      {children && (
        <Reveal delay={0.24}>
          <div className="mt-8">
            <Perforation className="mb-8 text-paper" />
            {children}
          </div>
        </Reveal>
      )}
    </div>
  );
}
