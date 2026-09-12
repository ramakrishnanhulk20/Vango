import type { Metadata } from "next";
import NewCardForm from "@/components/merchant/NewCardForm";

export const metadata: Metadata = {
  title: "Open a card",
};

export default function NewCardPage() {
  return <NewCardForm />;
}
