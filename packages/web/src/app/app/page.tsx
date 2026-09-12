import type { Metadata } from "next";
import WalletHome from "@/components/app/WalletHome";

export const metadata: Metadata = {
  title: "Your cards",
};

export default function WalletPage() {
  return <WalletHome />;
}
