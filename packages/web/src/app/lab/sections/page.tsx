import type { Metadata } from "next";
import Closing from "@/components/landing/Closing";
import ForMerchants from "@/components/landing/ForMerchants";
import HowItWorks from "@/components/landing/HowItWorks";
import Proof from "@/components/landing/Proof";

export const metadata: Metadata = {
  title: "Vango lab: sections",
  robots: { index: false, follow: false },
};

export default function LabSectionsPage() {
  return (
    <main>
      <div className="px-6 pt-10 md:px-12">
        <span className="label-type text-paper/35">Lab: landing sections</span>
      </div>
      <HowItWorks />
      <ForMerchants />
      <Proof />
      <Closing />
    </main>
  );
}
