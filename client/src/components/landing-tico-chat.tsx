"use client";

import { useEffect, useState } from "react";
import { TicoDock } from "@/components/analysis/tico-dock";

/** Keep the conversation mounted when scrolling back to the hero, but hide its UI. */
export function LandingTicoChat({ locale, sessionId, signedIn }: {
  locale: string;
  sessionId: string | null;
  signedIn: boolean;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const hero = document.querySelector("[data-landing-hero]");
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  return <div hidden={!visible} data-landing-chat>
    <TicoDock locale={locale} sessionId={sessionId} page="landing" signedIn={signedIn} />
  </div>;
}
