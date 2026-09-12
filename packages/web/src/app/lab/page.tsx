import type { Metadata } from "next";
import Hero from "@/components/hero/Hero";

export const metadata: Metadata = {
  title: "Vango lab",
  robots: { index: false, follow: false },
};

export default function LabPage() {
  return (
    <main>
      <Hero loopStamp />
    </main>
  );
}
