/** The dashed rule from the card in the hero. It is the motif that ties the app to it. */
export default function Perforation({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 280 2"
      preserveAspectRatio="none"
      className={`h-px w-full ${className}`}
    >
      <line
        x1="0"
        y1="1"
        x2="280"
        y2="1"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="2"
        strokeDasharray="2 5"
      />
    </svg>
  );
}
