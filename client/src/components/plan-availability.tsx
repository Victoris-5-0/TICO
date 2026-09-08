"use client";

import { useRef } from "react";
import Link from "next/link";
import styles from "./marketing-pages.module.css";

type Props = {
  plan: string; price: string; label: string; title: string; body: string;
  close: string; explore: string; href: string; variant: "premium" | "pro";
};

export function PlanAvailability(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button className={`${styles.planAction} ${props.variant === "pro" ? styles.proAction : styles.premiumAction}`} onClick={() => dialog.current?.showModal()}>{props.label}</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${props.variant}-title`} aria-describedby={`${props.variant}-body`}>
      <div className={styles.dialogTop}>
        <span>{props.plan} <bdi>{props.price}</bdi></span>
        <button onClick={() => dialog.current?.close()} aria-label={props.close} autoFocus>×</button>
      </div>
      <h2 id={`${props.variant}-title`}>{props.title}</h2>
      <p id={`${props.variant}-body`}>{props.body}</p>
      <Link className={`${styles.planAction} ${styles.proAction}`} href={props.href}>{props.explore}</Link>
    </dialog>
  </>;
}
