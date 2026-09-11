"use client";

import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { tags } from "@lezer/highlight";

import styles from "./mission-player.module.css";

/**
 * The student's Python editor.
 *
 * `docs/design.md` names CodeMirror as the editor and fixes the shape of it: 15px code
 * font, line numbers, `Ctrl/Cmd+Enter` runs. Everything visual below is ours — none of
 * CodeMirror's default chrome survives, because the workspace has to read as part of
 * TICO rather than as an editor someone embedded in it.
 *
 * The page is RTL in Arabic and the code is not. `dir="ltr"` and `lang="en"` are set on
 * the editor host, which is the LTR isolation boundary docs/design.md section 12
 * requires for code, tracebacks and test values.
 */

/**
 * Painted from the repo tokens rather than a stock CodeMirror theme.
 *
 * Dark, because the editor sits inside the mission's glass panel over the bakery. The
 * hues are the brand's — coral for keywords, teal for names, gold for numbers — lifted
 * to hold contrast on a near-black ground instead of the light surface they were tuned
 * for, where they would be unreadable.
 */
const ticoHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier], color: "#FF9E6B", fontWeight: "700" },
  { tag: [tags.controlKeyword], color: "#FF8A56", fontWeight: "700" },
  { tag: [tags.definitionKeyword], color: "#FF8A56", fontWeight: "700" },
  { tag: [tags.function(tags.variableName)], color: "#7FD8D5", fontWeight: "700" },
  { tag: [tags.definition(tags.variableName)], color: "#FFFFFF", fontWeight: "700" },
  { tag: [tags.variableName], color: "#EFE7E0" },
  { tag: [tags.propertyName], color: "#7FD8D5" },
  { tag: [tags.number, tags.bool], color: "#F3C06B", fontWeight: "700" },
  { tag: [tags.string, tags.special(tags.string)], color: "#8FD6A6" },
  { tag: [tags.comment], color: "#9A8F96", fontStyle: "italic" },
  { tag: [tags.operator], color: "#C4B8BF" },
  { tag: [tags.typeName, tags.className], color: "#7FD8D5" },
  { tag: [tags.punctuation, tags.bracket], color: "#A99DA4" },
]);

const ticoTheme = EditorView.theme(
  {
    "&": {
      color: "#EFE7E0",
      backgroundColor: "transparent",
      fontSize: "15px",
      direction: "ltr",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-code), ui-monospace, monospace",
      lineHeight: "1.75",
      padding: "14px 0",
      // JetBrains Mono ligates `->` into a single `→` glyph. In an editor for children
      // learning to type Python that is a bug, not a flourish: they are told to write
      // `-> int` and shown a character that is not on their keyboard.
      fontVariantLigatures: "none",
      fontFeatureSettings: '"liga" 0, "calt" 0',
    },
    ".cm-content": { padding: "0", caretColor: "#FF9E6B" },
    ".cm-line": { padding: "0 18px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      borderInlineEnd: "1px solid rgba(255,255,255,.10)",
      color: "#6F656C",
      paddingInlineEnd: "4px",
      minWidth: "44px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 10px 0 14px",
      fontVariantNumeric: "tabular-nums",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,.05)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#FF9E6B" },
    ".cm-cursor, .cm-dropCursor": { borderLeftWidth: "2px", borderLeftColor: "#FF9E6B" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(61,171,169,.32)",
    },
    ".cm-selectionMatch": { backgroundColor: "rgba(233,153,47,.28)" },
    ".cm-placeholder": { color: "#7E747B", fontStyle: "italic" },
  },
  { dark: true },
);

export type CodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  /** Phase 4 shows the finished code and never lets them edit it. */
  readOnly?: boolean;
  onRun?: () => void;
  placeholder?: string;
  ariaLabel: string;
  minHeight?: number;
};

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  onRun,
  placeholder,
  ariaLabel,
  minHeight = 150,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Callbacks live in refs so changing one does not tear down the editor and lose the
  // cursor mid-keystroke. Synced in an effect, never during render — a ref written
  // while rendering is not guaranteed to be the value a committed effect reads.
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);

  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
  });

  useEffect(() => {
    if (!host.current) return;

    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      python(),
      syntaxHighlighting(ticoHighlight),
      ticoTheme,
      indentUnit.of("    "),
      EditorView.lineWrapping,
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      keymap.of([
        {
          // docs/design.md: Ctrl/Cmd+Enter runs. Registered before the defaults so
          // nothing else claims it first.
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            onRunRef.current?.();
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
      }),
      EditorView.contentAttributes.of({
        "aria-label": ariaLabel,
        dir: "ltr",
        lang: "en",
        ...(readOnly ? { "aria-readonly": "true" } : {}),
      }),
    ];

    if (placeholder) extensions.push(cmPlaceholder(placeholder));

    const instance = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host.current,
    });
    view.current = instance;

    return () => {
      instance.destroy();
      view.current = null;
    };
    // `value` is deliberately absent: it seeds the document once, and later changes are
    // reconciled below. Rebuilding on every keystroke would destroy the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, placeholder, ariaLabel]);

  // Reconcile an outside change — a phase advancing, or Reset — without disturbing the
  // document when the student is the one who typed it.
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current === value) return;
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: Math.min(instance.state.selection.main.anchor, value.length) },
    });
  }, [value]);

  return (
    <div
      ref={host}
      dir="ltr"
      lang="en"
      className={`${styles.editor} ${readOnly ? styles.editorReadOnly : ""}`}
      style={{ minHeight }}
    />
  );
}
