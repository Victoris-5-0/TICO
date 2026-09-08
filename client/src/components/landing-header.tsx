"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing-page.module.css";

export function LandingHeader({ children }: { children: React.ReactNode }) {
  const marker = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    if (marker.current) observer.observe(marker.current);
    return () => observer.disconnect();
  }, []);

  return <>
    <div ref={marker} className={styles.scrollMarker} aria-hidden="true" />
    <header className={styles.header} data-scrolled={scrolled}>{children}</header>
  </>;
}
