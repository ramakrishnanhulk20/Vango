import type { Metadata } from "next";
import RedeemDesk from "@/components/merchant/RedeemDesk";

export const metadata: Metadata = {
  title: "Redeem a reward",
};

export default function RedeemDeskPage() {
  return <RedeemDesk />;
}
