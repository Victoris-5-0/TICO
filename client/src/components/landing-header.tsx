"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing-page.module.css";

export function LandingHeader({ children }: { children: React.ReactNode }) {
  const marker = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    if (!window.location.hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }

    const handleBeforeUnload = () => {
      window.scrollTo(0, 0);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );
    if (marker.current) observer.observe(marker.current);

    return () => {
      observer.disconnect();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if ("scrollRestoration" in history) {
        history.scrollRestoration = "auto";
      }
    };
  }, []);

  return (
    <>
      <div ref={marker} className={styles.scrollMarker} aria-hidden="true" />
      <header className={styles.header} data-scrolled={scrolled}>
        {children}
      </header>
    </>
  );
}
