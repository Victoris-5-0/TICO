"use client";

import { motion } from "motion/react";
import { asset } from "@/lib/bakery/scene-manifest";
import { customerMoodLabel, customerTimeLabel, type CustomerOrderState } from "@/lib/bakery/customer-orders";
import styles from "./customer-order-bubble.module.css";

export function CustomerOrderBubble({ order, isActive, reducedMotion, locale }: {
  order: CustomerOrderState;
  isActive: boolean;
  reducedMotion: boolean;
  locale: string;
}) {
  const ar = locale.startsWith("ar");
  const served = order.urgency === "served";
  const format = new Intl.NumberFormat(locale);
  const mood = customerMoodLabel(order.urgency, locale);
  const time = customerTimeLabel(order, locale);
  const label = ar
    ? `${order.customerName}، عدد الأرغفة: ${format.format(order.loaves)}، ${mood}`
    : `${order.customerName}: ${format.format(order.loaves)} loaves, ${mood}`;

  return (
    <g className={styles.bubble} transform="translate(0 -292)" data-bubble-for={order.id}
      data-urgency={order.urgency} data-active={isActive} data-loaves={order.loaves}>
      <title>{label}</title>
      <rect className={styles.shadow} x={-48} y={-95} width={96} height={88} rx={17} />
      <path className={styles.shell} d="M -31 -100 H 31 Q 48 -100 48 -83 V -31 Q 48 -14 31 -14 H 8 L 0 -3 L -8 -14 H -31 Q -48 -14 -48 -31 V -83 Q -48 -100 -31 -100 Z" />
      {isActive && !served && <g>
        <rect className={styles.next} x={-30} y={-109} width={60} height={18} rx={9} />
        <text className={styles.nextLabel} x={0} y={-96} textAnchor="middle" direction={ar ? "rtl" : "ltr"}>{ar ? "عليه الدور" : "UP NEXT"}</text>
      </g>}
      <text className={styles.name} x={0} y={-76} textAnchor="middle" direction={ar ? "rtl" : "ltr"}>{order.customerName}</text>
      <image href={asset("loaf")} x={-35} y={-67} width={36} height={24} preserveAspectRatio="xMidYMid meet" />
      <text className={styles.quantity} x={4} y={-47} direction="ltr">×{format.format(order.loaves)}</text>
      <motion.g key={order.urgency} initial={reducedMotion ? false : { opacity: 0.5 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
        <text x={-29} y={-25} textAnchor="middle" fontSize={17} aria-hidden="true">{served ? "✓" : order.emote}</text>
        <text className={styles.timer} x={11} y={-26} textAnchor="middle" direction={ar ? "rtl" : "ltr"} data-order-time="">
          {order.patience <= 0 && !served ? (ar ? "مستعجل!" : "Hurry!") : time}
        </text>
      </motion.g>
      <rect className={styles.track} x={-30} y={-19} width={60} height={3} rx={1.5} />
      <path className={styles.patience} d="M -30 -17.5 H 30" pathLength={1} strokeDasharray={`${served ? 1 : order.patience / order.maxPatience} 1`} />
    </g>
  );
}
