import Hero from "@/components/hero/Hero";
import Closing from "@/components/landing/Closing";
import ForMerchants from "@/components/landing/ForMerchants";
import HowItWorks from "@/components/landing/HowItWorks";
import Proof from "@/components/landing/Proof";

export default function Home() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <ForMerchants />
      <Proof />
      <Closing />
    </main>
  );
}
