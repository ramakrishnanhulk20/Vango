import type { ReactNode } from "react";
import Grain from "./Grain";

type SectionProps = {
  id?: string;
  label?: string;
  grain?: number;
  className?: string;
  children: ReactNode;
};

// Every landing section is full bleed on the ink background and clips its own
// overflow, which is what lets the card art and the poster word run off the edge
// without giving the page a horizontal scrollbar at 375px.
export default function Section({
  id,
  label,
  grain = 0.06,
  className = "",
  children,
}: SectionProps) {
  return (
    <section id={id} className={`relative w-full overflow-hidden bg-ink ${className}`}>
      <Grain opacity={grain} />
      {label && (
        <div className="pointer-events-none absolute left-6 top-10 z-20 md:left-12">
          <span className="label-type text-paper/35">{label}</span>
        </div>
      )}
      {children}
    </section>
  );
}
