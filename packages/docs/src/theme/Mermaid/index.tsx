import type { ComponentProps, ReactElement } from 'react'
import OriginalMermaid from '@theme-original/Mermaid'
import type MermaidType from '@theme/Mermaid'

type Props = ComponentProps<typeof MermaidType>

/**
 * The stock Mermaid component renders nothing until the browser has drawn the SVG, which
 * makes the page jump. This frame is server-rendered, so the space and the border are
 * there from the first paint and the diagram fades into it.
 */
export default function Mermaid(props: Props): ReactElement {
  return (
    <figure className="mermaid-figure">
      <OriginalMermaid {...props} />
    </figure>
  )
}
