import type { Metadata } from "next";
import RedeemFlow from "@/components/app/RedeemFlow";

export const metadata: Metadata = {
  title: "Take your reward",
};

export default async function RedeemPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RedeemFlow code={code.toUpperCase()} />;
}
