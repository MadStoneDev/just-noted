import { useEffect, useState } from "react";

/** True while `query` matches. False during SSR and the first client render. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return matches;
}

/** Below lg (1024px): the sidebar list and the chat panel are overlays, not columns. */
export const OVERLAY_VIEWPORT = "(max-width: 1023.98px)";
