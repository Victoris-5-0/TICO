"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import styles from "@/components/landing-page.module.css";

type FaqItem = {
  readonly question: string;
  readonly answer: string;
};

export function FaqAccordion({ faqs }: { faqs: readonly FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();

  return (
    <div className={styles.faqs} role="region" aria-label="Frequently Asked Questions">
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;
        return (
          <motion.div
            key={faq.question}
            className={styles.faqItem}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={
              reducedMotion
                ? { duration: 0.15, delay: index * 0.06 }
                : { type: "spring" as const, stiffness: 450, damping: 26, delay: index * 0.06 }
            }
          >
            <button
              type="button"
              className={styles.faqButton}
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${index}`}
            >
              <span>{faq.question}</span>
              <motion.span
                className={styles.faqIcon}
                animate={reducedMotion ? {} : { rotate: isOpen ? 45 : 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                aria-hidden="true"
              >
                +
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`faq-answer-${index}`}
                  className={styles.faqAnswer}
                  initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p>{faq.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
