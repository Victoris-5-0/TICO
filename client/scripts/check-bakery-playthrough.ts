import "dotenv/config";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { db } from "../src/lib/db";
import type { PhasedMissionOut } from "../src/lib/ai/types";

async function main() {
  const directory = resolve("../ai-backend/content/prebuilt");
  const filter = process.argv.find((arg) => arg.startsWith("--filter="))?.slice(9) ?? "";
  const files = readdirSync(directory).filter((name) => /^(variables|conditionals)-[12]-/.test(name) && name.startsWith(filter)).sort();
  if (!files.length) throw new Error("No authored missions match the filter.");
  const token = randomBytes(24).toString("hex");
  const session = await db.authSession.create({ data: { id: randomBytes(12).toString("hex"), token, userId: "demo-student-1", expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  mkdirSync(resolve("../artifacts/bakery-check"), { recursive: true });
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: process.argv.includes("--motion") ? "no-preference" : "reduce", extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    await context.addCookies([{ name: "better-auth.session_token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    // Exercise gameplay without creating learner progress or making model calls.
    await context.route("**/api/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"data":null}' }));
    for (const file of files) {
      const mission = JSON.parse(readFileSync(resolve(directory, file), "utf8")).data as PhasedMissionOut;
      const page = await context.newPage();
      page.setDefaultTimeout(90_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const action = (name: string | RegExp) => page.getByRole("button", { name, exact: typeof name === "string" });
      console.log("OPEN", file);
      await page.goto(`http://localhost:3000/ar-EG/worlds/el-forn/missions/${mission.id}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.locator('figure[data-ready="ready"]').waitFor();
      await page.getByText(mission.phases.encounter.lineAr, { exact: true }).waitFor();
      await page.screenshot({ path: resolve(`../artifacts/bakery-check/${file.slice(0,14)}-opening.png`) });
      await action("يلا نبدأ").click();
      for (const interaction of mission.phases.encounter.world?.interactions ?? []) {
        await page.getByRole("button", { name: interaction.promptAr, exact: true }).click();
        console.log("CLICK", interaction.target);
      }
      await action("يلا نبدأ").click();
      for (const round of mission.phases.explore.rounds) {
        await action(round.optionsAr[round.correctIndex]).click();
        await action(/^(كمّل|السؤال اللي بعده)$/).click();
      }
      await action("وريني الكود").click();
      await action(mission.phases.understand.runLabelAr ?? "شغّل وشوف").click();
      await action("دوري أكتب").click();
      for (const [index, step] of mission.phases.guided.steps.entries()) {
        let code = step.code;
        for (const blank of step.blanks) code = code.replace("___", blank);
        await page.locator('.cm-content[contenteditable="true"]').click();
        await page.keyboard.press("Control+A");
        await page.keyboard.insertText(code);
        if (index === 0 && process.argv.includes("--recovery")) {
          await page.keyboard.press("Control+A");
          await page.keyboard.insertText("missing_order");
          await action("شغّل").click();
          await page.getByText("الكود وقف وهو بيشتغل.", { exact: true }).waitFor();
          await page.locator('.cm-content[contenteditable="true"]').click();
          await page.keyboard.press("Control+A");
          await page.keyboard.insertText(code);
        }
        await action("شغّل").click();
        await action(index === mission.phases.guided.steps.length - 1 ? "كمّل" : "الخطوة اللي بعدها").click();
        console.log("CODE", index + 1);
      }
      await page.locator('.cm-content[contenteditable="true"]').click();
      await page.keyboard.press("Control+A");
      await page.keyboard.insertText(mission.phases.remix.solutionCode);
      await action("شغّل").click();
      const finish = action("خلّصت المهمة");
      await finish.waitFor();
      await finish.click();
      await page.screenshot({ path: resolve(`../artifacts/bakery-check/${file.slice(0,14)}-result.png`) });
      console.log("COMPLETED", file);
      await action("العب تاني").click();
      const first = mission.phases.encounter.world?.interactions?.[0];
      if (first) {
        const target = action(first.promptAr);
        await target.focus();
        await page.keyboard.press("Enter");
        const second = mission.phases.encounter.world?.interactions?.[1];
        if (second) await action(second.promptAr).waitFor();
      }
      if (errors.length) throw new Error(errors.join("\n"));
      await page.close();
    }
  } catch (error) {
    for (const context of browser?.contexts() ?? []) {
      for (const page of context.pages()) {
        await page.screenshot({ path: resolve("../artifacts/bakery-check/failure.png") });
      }
    }
    throw error;
  } finally {
    await browser?.close();
    try {
      await db.authSession.delete({ where: { id: session.id } });
    } catch {
      console.error("Could not remove the temporary browser session; it expires within one hour.");
    } finally {
      await db.$disconnect();
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
