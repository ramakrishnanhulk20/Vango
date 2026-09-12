"use client";

import { useEffect, useState } from "react";
import { Arrow, ButtonLink } from "./Button";

/**
 * The way back into the wallet. The deep link is built on the client because it carries
 * the address of the page the customer is standing on, and the https link is the one
 * that still works on a phone with no Nimiq Pay installed yet.
 */
export default function OpenInPay({ host, tone = "primary" }: { host: string; tone?: "primary" | "ghost" }) {
  const fallback = `https://nimpay.app/miniapps/open/${host}`;
  const [deepLink, setDeepLink] = useState(fallback);

  useEffect(() => {
    setDeepLink(`nimiqpay://miniapp?url=${window.location.href}`);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <ButtonLink href={deepLink} tone={tone} external>
        Open in Nimiq Pay
        <Arrow />
      </ButtonLink>
      <a
        href={fallback}
        className="label-type self-center text-paper/45 underline decoration-paper/20 underline-offset-4 transition-colors duration-300 hover:text-paper/80 hover:decoration-stamp"
      >
        Or get Nimiq Pay
      </a>
    </div>
  );
}
