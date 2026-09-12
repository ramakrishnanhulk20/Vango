"use client";

import { useEffect, useId, useState } from "react";

const THEME = {
  fontFamily: "var(--font-body)",
  fontSize: "17px",
  primaryColor: "#161d2e",
  primaryTextColor: "#f3efe6",
  primaryBorderColor: "#ff5a2c",
  lineColor: "#ff5a2c",
  edgeLabelBackground: "#0d1220",
  tertiaryTextColor: "#f3efe6",
  secondaryColor: "#11172a",
  tertiaryColor: "#0b0f1a",
  background: "#0b0f1a",
  mainBkg: "#161d2e",
  nodeBorder: "#ff5a2c",
  clusterBkg: "rgba(243, 239, 230, 0.04)",
  clusterBorder: "rgba(243, 239, 230, 0.18)",
  actorBkg: "#161d2e",
  actorBorder: "#ff5a2c",
  actorTextColor: "#f3efe6",
  signalColor: "#f3efe6",
  signalTextColor: "#f3efe6",
  labelBoxBkgColor: "#161d2e",
  labelBoxBorderColor: "#ff5a2c",
  labelTextColor: "#f3efe6",
  noteBkgColor: "rgba(255, 90, 44, 0.12)",
  noteBorderColor: "#ff5a2c",
  noteTextColor: "#f3efe6",
};

// Mermaid keeps one global config and one hidden measuring element, so two diagrams
// drawing at the same moment can read each other's layout. They queue instead.
let queue: Promise<unknown> = Promise.resolve();

function draw(id: string, source: string) {
  const next = queue.then(async () => {
    const { default: mermaid } = await import("mermaid");

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "dark",
      fontFamily: "var(--font-body)",
      themeVariables: THEME,
      // Natural size, never squeezed to the column: a shrunk diagram turns its
      // labels into 9px mush. The frame scrolls sideways when one is too wide.
      flowchart: { useMaxWidth: false },
      sequence: {
        useMaxWidth: false,
        actorFontSize: 15,
        noteFontSize: 14,
        messageFontSize: 14,
      },
    });

    const { svg } = await mermaid.render(id, source);
    return svg;
  });

  queue = next.catch(() => undefined);
  return next;
}

export function Mermaid({ chart }: { chart: string }) {
  const id = `vango-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Mermaid measures rendered text to lay a diagram out, so it only runs in the
  // browser. The frame is server-rendered, so the page does not jump when the
  // drawing arrives.
  useEffect(() => {
    let live = true;

    draw(id, chart.replaceAll("\n", "\n"))
      .then((drawn) => live && setSvg(drawn))
      .catch(() => live && setFailed(true));

    return () => {
      live = false;
    };
  }, [chart, id]);

  return (
    <figure className="docs-diagram" data-drawn={svg ? "1" : "0"}>
      {svg ? (
        <div className="docs-diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <pre className="docs-diagram-fallback">{failed ? chart : null}</pre>
      )}
    </figure>
  );
}
