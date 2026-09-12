"use client";

import { Button } from "./Button";

/** For the one case a link cannot fix: the server render failed, so ask for it again. */
export default function ReloadButton({ label = "Try again" }: { label?: string }) {
  return <Button onClick={() => window.location.reload()}>{label}</Button>;
}
