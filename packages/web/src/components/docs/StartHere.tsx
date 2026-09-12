import Link from "next/link";

const paths = [
  {
    href: "/docs/getting-started/quick-start",
    label: "Quick start",
    note: "Open Vango inside Nimiq Pay and earn your first stamp.",
  },
  {
    href: "/docs/concepts/how-it-works",
    label: "How it works",
    note: "The loop in five steps, with the sequence diagram.",
  },
  {
    href: "/docs/guides/for-merchants",
    label: "For merchants",
    note: "Open a card, share it, hand over the reward at the counter.",
  },
  {
    href: "/docs/developers/api",
    label: "API reference",
    note: "Every route, its auth, its body and its errors.",
  },
  {
    href: "/docs/security/threat-model",
    label: "Threat model",
    note: "Every attack we tried, and what refused it.",
  },
];

export default function StartHere() {
  return (
    <nav className="docs-paths not-prose">
      {paths.map((path, index) => (
        <Link key={path.href} href={path.href} className="docs-path">
          <small>{String(index + 1).padStart(2, "0")}</small>
          <span>
            <b>{path.label}</b>
            <em>{path.note}</em>
          </span>
          <i aria-hidden>&rarr;</i>
        </Link>
      ))}
    </nav>
  );
}
