import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { directionOf, mixed } from "./prose";

/**
 * Lines from the four pinned missions, as a child sees them under `/en` — Arabic prose
 * in an English page. The rules pinned here are the ones a reader notices: the paragraph
 * reads right-to-left, a Python name is a single left-to-right island, and the
 * punctuation of the Arabic sentence stays on the Arabic side of that island.
 */

const html = (text: string) => renderToStaticMarkup(mixed(text) as never);

test("direction follows the text, not the page", () => {
  assert.equal(directionOf("المقارنة لوحدها بتجاوب صح أو غلط."), "rtl");
  assert.equal(directionOf("if بتختار الشغل"), "rtl");
  assert.equal(directionOf("Every test passed!"), "ltr");
  assert.equal(directionOf("if x >= 3: print(x)"), "ltr");
});

test("Python names in Arabic prose become left-to-right isolates", () => {
  assert.equal(
    html("المقارنة لوحدها بتجاوب صح أو غلط. if بتختار الشغل، وelse بتختار الشغل في الحالة التانية."),
    'المقارنة لوحدها بتجاوب صح أو غلط. <bdi dir="ltr" lang="en">if</bdi> بتختار الشغل، و<bdi dir="ltr" lang="en">else</bdi> بتختار الشغل في الحالة التانية.',
  );
});

test("sentence punctuation stays outside the isolate", () => {
  // `plan:` — the colon introduces the Arabic clause that follows it.
  assert.equal(
    html("لمتغيّر اسمه plan: لو الحرارة"),
    'لمتغيّر اسمه <bdi dir="ltr" lang="en">plan</bdi>: لو الحرارة',
  );
  // `"bake"،` — the Arabic comma is the sentence's, the quotes are the literal's.
  assert.equal(
    html('خزّن فيه "bake"، وغير كده'),
    'خزّن فيه <bdi dir="ltr" lang="en">&quot;bake&quot;</bdi>، وغير كده',
  );
  assert.equal(html("المتغيّر (Variable)"), 'المتغيّر (<bdi dir="ltr" lang="en">Variable</bdi>)');
});

test("an expression is one island, so its operator order survives", () => {
  assert.equal(
    html("لو temperature >= 200 خزّن فيه"),
    'لو <bdi dir="ltr" lang="en">temperature &gt;= 200</bdi> خزّن فيه',
  );
  assert.equal(
    html("خزّن فيه loaves_left ناقص order."),
    'خزّن فيه <bdi dir="ltr" lang="en">loaves_left</bdi> ناقص <bdi dir="ltr" lang="en">order</bdi>.',
  );
});

test("numbers alone are prose and are left as they are", () => {
  assert.equal(html("خزّن فيه عدد أرغفة أول دفعة: 8."), "خزّن فيه عدد أرغفة أول دفعة: 8.");
  assert.equal(html("لو الحرارة ٢٠٠ أو أكتر"), "لو الحرارة ٢٠٠ أو أكتر");
});

test("left-to-right text is returned untouched", () => {
  assert.equal(html("Not quite right yet."), "Not quite right yet.");
});
