import type { Metadata } from "next";
import Counter from "@/components/merchant/Counter";

export const metadata: Metadata = {
  title: "Your card",
};

export default async function CounterPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Counter code={code.toUpperCase()} />;
}
