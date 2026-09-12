import type { ReactNode } from "react";
import MerchantNav from "@/components/merchant/MerchantNav";

export default function MerchantLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MerchantNav />
      {children}
    </>
  );
}
