import { Fragment, type ReactNode } from "react";

/**
 * Mission prose is Arabic whatever the interface language is.
 *
 * Every line a mission speaks — `lineAr`, `promptAr`, `explanationAr` — is Egyptian
 * Arabic, and the same mission plays under `/en` with English chrome around it. The
 * text elements used to take their direction from the *locale*, so under `/en` an
 * Arabic paragraph was laid out left-to-right: it started from the wrong edge and every
 * inline `if` or `next_give` landed on the wrong side of the words around it. Direction
 * is a property of the text, not of the page, so it is read off the text here.
 *
 * ## Inline code
 *
 * The prose names Python things by their real names — `if`, `else`, `plan`, `"bake"`,
 * and occasionally an expression like `temperature >= 200` in a hint. Left to the bidi
 * algorithm, a bare identifier survives, but operators and digits between two Latin
 * tokens are "neutral" and get re-ordered around the Arabic. So each Python-looking run
 * is wrapped in its own left-to-right isolate, which `docs/design.md` §12 asks for.
 *
 * The isolate stops at the token: the colon in `plan:` and the comma in `"bake"،` belong
 * to the Arabic sentence, and an isolate that swallowed them would put them on the far
 * side of the word. Arabic-Indic digits (`٢٠٠`) are prose and are left alone.
 */

const ARABIC = /[؀-ۿݐ-ݿ]/;

/** The direction a run of prose reads in: RTL the moment it contains Arabic letters. */
export const directionOf = (text: string): "rtl" | "ltr" => (ARABIC.test(text) ? "rtl" : "ltr");

const TOKEN = String.raw`(?:"[^"\n]*"|'[^'\n]*'|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|\d+(?:\.\d+)?)`;
const OPERATOR = String.raw`(?:==|!=|>=|<=|[<>=+\-*/%])`;
/** A token, or several joined by operators: `plan`, `"open"`, `stock - order >= 3`. */
const CODE = new RegExp(`${TOKEN}(?:[ \\t]*${OPERATOR}[ \\t]*${TOKEN})*`, "g");
/** Something worth isolating — a bare number reads the same either way. */
const HAS_CODE = /[A-Za-z"']/;

/**
 * The text with its Python-looking runs isolated left-to-right.
 *
 * Only Arabic text needs it: in a left-to-right paragraph the code already reads in
 * order, and wrapping every English word would be noise.
 */
export function mixed(text: string): ReactNode {
  if (directionOf(text) === "ltr") return text;

  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(CODE)) {
    const run = match[0];
    const at = match.index ?? 0;
    if (!HAS_CODE.test(run)) continue;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(<bdi key={at} dir="ltr" lang="en">{run}</bdi>);
    last = at + run.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string"
    ? parts[0]
    : parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}

/** `dir` and `lang` for an element that holds one run of prose. */
export const proseAttrs = (text: string) =>
  directionOf(text) === "rtl" ? ({ dir: "rtl", lang: "ar" } as const) : ({ dir: "ltr" } as const);

/**
 * One paragraph of mission prose, directed by its own content.
 *
 * `children` is an optional prefix that stays as given — a round counter or hint rung
 * label that is chrome, not prose.
 */
export function Prose({ text, className, role, children }: { text: string; className?: string; role?: string; children?: ReactNode }) {
  return (
    <p className={className} role={role} {...proseAttrs(text)}>
      {children}
      {mixed(text)}
    </p>
  );
}
