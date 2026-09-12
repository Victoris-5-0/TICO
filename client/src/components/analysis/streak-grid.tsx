/**
 * The contribution grid, in the bakery's colours.
 *
 * A square per day for a year, weeks as columns, Saturday at the top — the first
 * day of the week in Egypt, so the weekend is not stranded in the middle of the column.
 *
 * ## One deliberate departure from the thing it resembles
 *
 * **Coming back is what is counted, not volume.** The darkest square is four attempts, not
 * forty. A learner who returns for ten minutes on six days has done better than one who
 * sat for four hours once, and the grid should say so rather than rewarding the marathon.
 */

import type { Analysis } from "@/services/analysis.service";

import styles from "./analysis.module.css";

/** Attempts per day → intensity. Four is the top on purpose; see the note above. */
function level(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export function StreakGrid({
  streak,
  locale,
}: {
  streak: Analysis["streak"];
  locale: string;
}) {
  const ar = locale.startsWith("ar");

  // Columns of seven. The final week is short until the week is over, so it is padded with
  // nulls rather than with zeroes — an empty square and a day that has not happened are
  // different things.
  const weeks: (typeof streak.days[number] | null)[][] = [];
  for (let i = 0; i < streak.days.length; i += 7) {
    const week = streak.days.slice(i, i + 7);
    while (week.length < 7) week.push(null as never);
    weeks.push(week);
  }

  const fmt = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
  });

  // A month label above the column where each month starts, so the run has landmarks.
  const monthAt = new Map<number, string>();
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const first = week.find(Boolean);
    if (!first) return;
    const d = new Date(first.day);
    if (d.getMonth() !== lastMonth) {
      // Every other month. Fifty-three narrow columns cannot carry twelve labels without
      // them colliding, and a label every eight weeks is enough to navigate by.
      const skip = lastMonth !== -1 && monthAt.size % 2 === 1;
      lastMonth = d.getMonth();
      if (!skip) {
        monthAt.set(i, new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", { month: "short" }).format(d));
      } else {
        monthAt.set(i, "");
      }
    }
  });

  return (
    <section className={styles.card} data-tour="streak">
      <div className={styles.streakHead}>
        <div>
          <h2>{ar ? "المواظبة" : "Coming back"}</h2>
          <p className={styles.hint}>
            {ar
              ? "إنك ترجع تاني أهم من إنك تقعد ساعات. كل مربع يوم."
              : "Coming back matters more than sitting for hours. Each square is a day."}
          </p>
        </div>

        <div className={styles.streakNumbers}>
          <div className={styles.streakStat}>
            <span className={styles.streakValue}>{streak.current}</span>
            <span className={styles.streakLabel}>{ar ? "أيام ورا بعض" : "day streak"}</span>
          </div>
          <div className={styles.streakStat}>
            <span className={styles.streakValue}>{streak.longest}</span>
            <span className={styles.streakLabel}>{ar ? "أطول سلسلة" : "longest"}</span>
          </div>
          <div className={styles.streakStat}>
            <span className={styles.streakValue}>{streak.activeDays}</span>
            <span className={styles.streakLabel}>{ar ? "يوم شغل" : "active days"}</span>
          </div>
        </div>
      </div>

      <div className={styles.gridScroll}>
        <div className={styles.gridInner}>
          <div className={styles.months} aria-hidden="true">
            {weeks.map((_, i) => (
              <span key={i} className={styles.month}>{monthAt.get(i) ?? ""}</span>
            ))}
          </div>

          <div className={styles.grid7} role="img"
               aria-label={
                 ar
                   ? `${streak.activeDays} يوم فيه شغل خلال آخر سنة`
                   : `${streak.activeDays} active days over the last year`
               }>
            {weeks.map((week, wi) => (
              <div key={wi} className={styles.week}>
                {week.map((day, di) =>
                  day ? (
                    <span
                      key={day.day}
                      className={`${styles.cell} ${styles[`lv${level(day.count)}`]}`}
                      title={
                        day.count === 0
                          ? `${fmt.format(new Date(day.day))} — ${ar ? "مفيش" : "nothing"}`
                          : `${fmt.format(new Date(day.day))} — ${day.count} ${
                              ar ? "محاولة" : "attempts"
                            }, ${day.passed} ${ar ? "نجحت" : "passed"}`
                      }
                    />
                  ) : (
                    <span key={`${wi}-${di}`} className={styles.cellVoid} />
                  ),
                )}
              </div>
            ))}
          </div>

          <div className={styles.legend}>
            <span className={styles.legendText}>{ar ? "أقل" : "Less"}</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`${styles.cell} ${styles[`lv${l}`]}`} />
            ))}
            <span className={styles.legendText}>{ar ? "أكتر" : "More"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
