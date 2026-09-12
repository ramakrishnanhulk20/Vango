import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import Notice from "@/components/app/Notice";
import PayPanel from "@/components/app/PayPanel";
import Reveal from "@/components/app/Reveal";
import ReloadButton from "@/components/app/ReloadButton";
import { ApiError, getCard, type PublicCard } from "@/lib/api";
import { minimumText, ruleText } from "@/lib/cardText";

type PageProps = { params: Promise<{ code: string }> };

type Loaded = { card: PublicCard } | { card: null; missing: boolean; why: string };

/**
 * The card is read on the server so the page is complete on arrival, which is what a
 * printed link or a QR code at a counter needs: the shop and the rule are on screen
 * before any wallet has answered.
 */
async function load(code: string): Promise<Loaded> {
  try {
    return { card: await getCard(code.toUpperCase()) };
  } catch (thrown) {
    if (thrown instanceof ApiError && thrown.status === 404) {
      return { card: null, missing: true, why: "unknown card" };
    }
    return {
      card: null,
      missing: false,
      why: thrown instanceof ApiError ? thrown.message : "Vango could not be reached.",
    };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded.card) return { title: "Card not found" };
  return { title: `${loaded.card.name}: ${loaded.card.rewardText}` };
}

export default async function CardPage({ params }: PageProps) {
  const { code } = await params;
  const host = (await headers()).get("host") ?? "vango.app";
  const loaded = await load(code);

  if (!loaded.card) {
    if (loaded.missing) {
      return (
        <Notice
          label="Card"
          title="No card with that code"
          body="Check the code printed on the shop's card, or ask them for the link again."
        >
          <Link
            href="/app"
            className="label-type text-paper/55 underline decoration-paper/20 underline-offset-4 transition-colors duration-300 hover:text-paper hover:decoration-stamp"
          >
            Your cards
          </Link>
        </Notice>
      );
    }

    return (
      <Notice label="Card" title="This card did not load" body={loaded.why} tone="bad">
        <ReloadButton />
      </Notice>
    );
  }

  const card = loaded.card;

  return (
    <main className="flex flex-1 flex-col pb-4 pt-8">
      <Reveal>
        <Link
          href="/app"
          className="label-type group inline-flex items-center gap-2 text-paper/40 transition-colors duration-300 hover:text-paper"
        >
          <span aria-hidden className="transition-transform duration-300 group-hover:-translate-x-1">
            &larr;
          </span>
          Your cards
        </Link>
      </Reveal>

      <Reveal delay={0.06}>
        <span className="label-type mt-8 block text-stamp">{card.code}</span>
      </Reveal>

      <Reveal delay={0.12}>
        <h1
          className="display-type mt-3 text-paper"
          style={{
            fontSize: "clamp(2.5rem, 13vw, 3.5rem)",
            letterSpacing: "-0.04em",
            lineHeight: 0.92,
          }}
        >
          {card.name}
        </h1>
      </Reveal>

      <Reveal delay={0.18}>
        <p className="mt-5 max-w-[30ch] text-[1.125rem] leading-snug text-paper/85">
          {ruleText(card)}
        </p>
      </Reveal>

      <Reveal delay={0.22}>
        <p className="label-type mt-4 text-paper/40">
          {card.rewardText} &middot; {minimumText(card.minLuna)}
        </p>
      </Reveal>

      <PayPanel card={card} host={host} />
    </main>
  );
}
