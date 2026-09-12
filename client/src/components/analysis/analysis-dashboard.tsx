/**
 * What the service already knows about a learner, made visible.
 *
 * A server component: every figure comes from `analysis.service.ts`, which counts rows.
 * Nothing here calls a model and nothing is estimated — the same rule the debrief follows,
 * because a wrong number in front of a child or a teacher is worse than no number.
 *
 * Read as one page it answers four questions a teacher actually asks: how far are they,
 * what do they get wrong, do they fight the language or the thinking, and are they leaning
 * on hints.
 */

import Image from "next/image";

import { StreakGrid } from "@/components/analysis/streak-grid";
import { LearnerIdentity } from "@/components/analysis/learner-identity";
import { TicoDock } from "@/components/analysis/tico-dock";
import type { Analysis, TagRow } from "@/services/analysis.service";
import { syntaxVsLogicFromTags } from "@/services/analysis.service";

import styles from "./analysis.module.css";

type Copy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  stats: Record<"missions" | "passed" | "overcome" | "minutes" | "concepts", string>;
  concepts: { heading: string; hint: string; done: string; extended: string; locked: string };
  tags: { heading: string; hint: string; overcome: string; empty: string };
  split: { heading: string; hint: string; syntax: string; logic: string; empty: string };
  hints: { heading: string; hint: string; rung: string; empty: string };
  activity: { heading: string; hint: string };
  sessions: {
    heading: string; hint: string;
    mission: string; outcome: string; attempts: string; hintsUsed: string; time: string;
    untitled: string; open: string;
  };
  empty: { title: string; body: string };
  footnote: string;
};

const AR: Copy = {
  eyebrow: "تحليل التعلّم",
  title: "رحلة التعلّم بتاعتك",
  subtitle:
    "كل رقم هنا متحسوب من شغلك الفعلي — مفيش تقدير ومفيش تخمين. ده اللي النظام شايفه وإنت بتتعلّم.",
  stats: {
    missions: "محاولة",
    passed: "نجحت",
    overcome: "غلطة اتصلحت",
    minutes: "دقيقة",
    concepts: "مفهوم خلص",
  },
  concepts: {
    heading: "المفاهيم",
    hint: "كل مفهوم ٣ محطات. لو لسه محتاج وقت، الطريق بيطول لـ ٦ — وبعدها بتكمّل على أي حال.",
    done: "خلص",
    extended: "الطريق طوّل",
    locked: "لسه",
  },
  tags: {
    heading: "الغلطات اللي بتتكرر",
    hint: "الأخضر معناه إن الغلطة دي ظهرت وبعدين وقفت. دي أحلى حاجة في الصفحة دي.",
    overcome: "اتصلحت",
    empty: "لسه مفيش غلطات متسجّلة.",
  },
  split: {
    heading: "لغة ولا تفكير؟",
    hint: "الغلطات في كتابة بايثون نفسها، ولا في طريقة حل المسألة؟ الفرق ده بيغيّر نوع المساعدة المطلوبة.",
    syntax: "كتابة",
    logic: "تفكير",
    empty: "محتاجين غلطات أكتر عشان نقدر نقول.",
  },
  hints: {
    heading: "سلّم التلميحات",
    hint: "الدرجة ٤ هي آخر تلميح. لو بتوصلها كتير، المهمة صعبة أوي أو المفهوم لسه مش واضح.",
    rung: "درجة",
    empty: "مفيش تلميحات لسه.",
  },
  activity: { heading: "آخر أسبوعين", hint: "الغامق معناه محاولة نجحت." },
  sessions: {
    heading: "آخر المهام",
    hint: "",
    mission: "المهمة",
    outcome: "النتيجة",
    attempts: "محاولات",
    hintsUsed: "تلميحات",
    time: "الوقت",
    untitled: "مهمة",
    open: "لسه شغّالة",
  },
  empty: {
    title: "لسه مفيش حاجة نعرضها",
    body: "خلّص أول مهمة وهتلاقي هنا كل حاجة عن اللي بتتعلّمه.",
  },
  footnote:
    "كل الأرقام دي متحسوبة من قاعدة البيانات مباشرة — مفيش نموذج ذكاء اصطناعي بيخمّن أي رقم منها.",
};

const EN: Copy = {
  eyebrow: "Learning analysis",
  title: "Your learning journey",
  subtitle:
    "Every figure here is counted from your actual work — nothing estimated, nothing guessed. This is what the system sees while you learn.",
  stats: {
    missions: "attempts",
    passed: "passed",
    overcome: "mistakes fixed",
    minutes: "minutes",
    concepts: "concepts done",
  },
  concepts: {
    heading: "Concepts",
    hint: "Three stops each. If more time is needed the path grows to six — and then it moves on regardless.",
    done: "done",
    extended: "path grew",
    locked: "not started",
  },
  tags: {
    heading: "Mistakes that repeat",
    hint: "Green means the mistake appeared and then stopped. That is the best thing on this page.",
    overcome: "fixed",
    empty: "No classified mistakes yet.",
  },
  split: {
    heading: "Language or thinking?",
    hint: "Are the mistakes in writing Python, or in working out the problem? The difference changes what help is worth giving.",
    syntax: "language",
    logic: "thinking",
    empty: "Not enough mistakes yet to say.",
  },
  hints: {
    heading: "The hint ladder",
    hint: "Rung 4 is the last hint. Reaching it often means the mission is too hard or the concept has not landed.",
    rung: "rung",
    empty: "No hints used yet.",
  },
  activity: { heading: "Last two weeks", hint: "Darker means an attempt that passed." },
  sessions: {
    heading: "Recent missions",
    hint: "",
    mission: "Mission",
    outcome: "Outcome",
    attempts: "Attempts",
    hintsUsed: "Hints",
    time: "Time",
    untitled: "Mission",
    open: "still open",
  },
  empty: {
    title: "Nothing to show yet",
    body: "Finish your first mission and everything about what you are learning appears here.",
  },
  footnote:
    "Every figure is counted from the database directly — no model estimates any number on this page.",
};

const pct = (n: number) => Math.round(n * 100);

function Stops({ row }: { row: Analysis["concepts"][number] }) {
  return (
    <div className={styles.stops} aria-label={`${row.completed} of ${row.stopsTotal}`}>
      {Array.from({ length: row.stopsTotal }, (_, i) => (
        <span
          key={i}
          className={[
            styles.stop,
            i < row.completed ? styles.stopDone : "",
            i >= 3 ? styles.stopExtra : "",
          ].filter(Boolean).join(" ")}
        />
      ))}
    </div>
  );
}

export function AnalysisDashboard({
  analysis,
  locale,
}: {
  analysis: Analysis;
  locale: string;
}) {
  const ar = locale.startsWith("ar");
  const t = ar ? AR : EN;
  const { totals, concepts, tags, hintLadder, sessions } = analysis;

  const nothingYet = totals.submissions === 0 && sessions.length === 0;

  if (nothingYet) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.empty}>
            <Image src="/assets/characters/tico/tico-thinking.webp" alt="" width={128} height={128} />
            <p>
              <strong>{t.empty.title}</strong>
              {t.empty.body}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const split = syntaxVsLogicFromTags(tags);
  const splitTotal = split.syntax + split.logic;
  const maxTag = Math.max(1, ...tags.map((x) => x.total));
  const maxRung = Math.max(1, ...hintLadder.map((r) => r.count));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headCopy}>
          <p className={styles.eyebrow}>{t.eyebrow}</p>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </div>
        {/* He used to be a portrait here. A dashboard is the screen a learner is most
            likely to misread, so he walks it and says what each number means instead. */}
        <TicoDock locale={locale} sessionId={sessions[0]?.id ?? null} />
      </header>

      <LearnerIdentity profile={analysis.profile} totals={totals} locale={locale} />

      <div className={styles.stats} data-tour="stats">
        <div className={`${styles.stat} ${styles["stat--coral"]}`}>
          <div className={styles.statValue}>{totals.submissions}</div>
          <div className={styles.statLabel}>{t.stats.missions}</div>
        </div>
        <div className={`${styles.stat} ${styles["stat--teal"]}`}>
          <div className={styles.statValue}>{totals.passed}</div>
          <div className={styles.statLabel}>{t.stats.passed}</div>
        </div>
        <div className={`${styles.stat} ${styles["stat--teal"]}`}>
          <div className={styles.statValue}>{totals.tagsOvercome}</div>
          <div className={styles.statLabel}>{t.stats.overcome}</div>
        </div>
        <div className={`${styles.stat} ${styles["stat--gold"]}`}>
          <div className={styles.statValue}>{totals.conceptsComplete}</div>
          <div className={styles.statLabel}>{t.stats.concepts}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{totals.minutes}</div>
          <div className={styles.statLabel}>{t.stats.minutes}</div>
        </div>
      </div>

      <StreakGrid streak={analysis.streak} locale={locale} />

      {/* ---------------------------------------------------------- concepts */}
      <section className={styles.card} data-tour="concepts">
        <h2>{t.concepts.heading}</h2>
        <p className={styles.hint}>{t.concepts.hint}</p>

        {concepts.map((c) => (
          <div key={c.conceptId} className={styles.concept}>
            <div className={styles.conceptName}>
              {ar && c.nameAr ? c.nameAr : c.name}
              <small>{c.slug}</small>
            </div>
            <Stops row={c} />
            <div className={styles.conceptMeta}>
              <div className={styles.bar}>
                <div
                  className={`${styles.barFill} ${c.mastery < 0.75 ? styles["barFill--short"] : ""}`}
                  style={{ width: `${Math.max(2, pct(c.mastery))}%` }}
                />
              </div>
              <span className={styles.pct}>{pct(c.mastery)}%</span>
              <span
                className={[
                  styles.badge,
                  c.isComplete ? styles.badgeDone
                    : c.completed === 0 ? styles.badgeLocked
                    : c.extended ? styles.badgeExtended
                    : styles.badgeLocked,
                ].join(" ")}
              >
                {c.isComplete ? t.concepts.done
                  : c.extended ? t.concepts.extended
                  : `${c.completed}/${c.stopsTotal}`}
              </span>
            </div>
          </div>
        ))}
      </section>

      <div className={`${styles.grid} ${styles.grid2}`}>
        {/* ------------------------------------------------------------ tags */}
        <section className={styles.card} data-tour="tags">
          <h2>{t.tags.heading}</h2>
          <p className={styles.hint}>{t.tags.hint}</p>

          {tags.length === 0 ? (
            <p className={styles.footnote}>{t.tags.empty}</p>
          ) : (
            <div className={styles.tagList}>
              {tags.slice(0, 8).map((x: TagRow) => (
                <div key={x.tag} className={styles.tagRow}>
                  <span className={styles.tagName}>{x.tag}</span>
                  {x.overcome && <span className={styles.overcome}>{t.tags.overcome}</span>}
                  <span className={styles.tagBar}>
                    <span
                      className={`${styles.tagBarFill} ${x.overcome ? styles["tagBarFill--overcome"] : ""}`}
                      style={{ width: `${(x.total / maxTag) * 100}%` }}
                    />
                  </span>
                  <span className={styles.tagCount}>{x.total}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* --------------------------------------------------- syntax / logic */}
        <section className={styles.card} data-tour="split">
          <h2>{t.split.heading}</h2>
          <p className={styles.hint}>{t.split.hint}</p>

          {splitTotal === 0 ? (
            <p className={styles.footnote}>{t.split.empty}</p>
          ) : (
            <>
              <div className={styles.split}>
                {split.syntax > 0 && (
                  <div
                    className={`${styles.splitPart} ${styles.splitSyntax}`}
                    style={{ flex: split.syntax }}
                  >
                    {Math.round((split.syntax / splitTotal) * 100)}%
                  </div>
                )}
                {split.logic > 0 && (
                  <div
                    className={`${styles.splitPart} ${styles.splitLogic}`}
                    style={{ flex: split.logic }}
                  >
                    {Math.round((split.logic / splitTotal) * 100)}%
                  </div>
                )}
              </div>
              <div className={styles.splitLegend}>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: "var(--gold)" }} />
                  {t.split.syntax}
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: "var(--teal)" }} />
                  {t.split.logic}
                </span>
              </div>
            </>
          )}
        </section>

        {/* ------------------------------------------------------ hint ladder */}
        <section className={styles.card} data-tour="hints">
          <h2>{t.hints.heading}</h2>
          <p className={styles.hint}>{t.hints.hint}</p>

          {totals.hints === 0 ? (
            <p className={styles.footnote}>{t.hints.empty}</p>
          ) : (
            <div className={styles.rungs}>
              {hintLadder.map((r) => (
                <div key={r.rung} className={styles.rung}>
                  <span className={styles.rungLabel}>{t.hints.rung} {r.rung}</span>
                  <span className={styles.rungBar}>
                    <span
                      className={styles.rungFill}
                      style={{ width: `${(r.count / maxRung) * 100}%` }}
                    />
                  </span>
                  <span className={styles.rungCount}>{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---------------------------------------------------------- sessions */}
      {sessions.length > 0 && (
        <section className={styles.card} data-tour="sessions">
          <h2>{t.sessions.heading}</h2>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t.sessions.mission}</th>
                  <th>{t.sessions.outcome}</th>
                  <th className={styles.num}>{t.sessions.attempts}</th>
                  <th className={styles.num}>{t.sessions.hintsUsed}</th>
                  <th className={styles.num}>{t.sessions.time}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title ?? t.sessions.untitled}</td>
                    <td>
                      <span
                        className={[
                          styles.outcome,
                          s.outcome === "SOLVED" ? styles.outcomeSolved
                            : s.outcome === "IN_PROGRESS" ? styles.outcomeOpen
                            : styles.outcomeOther,
                        ].join(" ")}
                      >
                        {s.outcome === "IN_PROGRESS" ? t.sessions.open : s.outcome.toLowerCase()}
                      </span>
                    </td>
                    <td className={styles.num}>{s.attempts}</td>
                    <td className={styles.num}>{s.hints}</td>
                    <td className={styles.num}>
                      {s.timeSpentMs ? `${Math.round(s.timeSpentMs / 60000)}m` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className={styles.footnote}>{t.footnote}</p>
    </div>
  );
}
