/**
 * Screenshot a page of the running dev server, signed in.
 *
 *   pnpm shot /ar-EG/worlds/el-forn                       -> /tmp/tico-shot.png
 *   pnpm shot /en/worlds/el-forn out.png 1440 900
 *   pnpm shot "/ar-EG/worlds/el-forn/missions/<id>" m.png 1600 1000 --phase 3
 *
 * Most of TICO is behind the auth gate, so a plain headless capture lands on the login
 * page. This mints a session for a demo user, sets the cookie, and removes the session
 * again afterwards — nothing is left behind in the database.
 *
 * `--phase N` clicks the primary action N times first, which is how you photograph a
 * mission phase other than the first without doing it by hand.
 */

import "dotenv/config";
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

const db = new PrismaClient();

const BASE = process.env.SHOT_BASE_URL ?? "http://localhost:3000";
const USER = process.env.SHOT_USER_ID ?? "demo-student-1";

async function main() {
  const [path = "/", out = "/tmp/tico-shot.png", width = "1440", height = "900"] = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"));

  const phaseFlag = process.argv.indexOf("--phase");
  const advance = phaseFlag >= 0 ? Number(process.argv[phaseFlag + 1] ?? 0) : 0;

  const token = randomBytes(24).toString("hex");
  const session = await db.authSession.create({
    data: {
      id: randomBytes(12).toString("hex"),
      token,
      userId: USER,
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // The system Chrome, not Playwright's own build: it is already installed and this
  // avoids a ~170MB download for what is only ever a screenshot.
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({
      viewport: { width: Number(width), height: Number(height) },
      deviceScaleFactor: 2,
      // The cookie gets past the middleware, but Better Auth signs its cookies and will
      // not validate a hand-minted one — so `getCurrentUser` would see nobody and every
      // progress-dependent page would render logged-out. The Bearer path looks the token
      // up directly, which is what makes a real student's view photographable.
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      // The world pages only require the cookie to exist; the page itself reads the
      // database directly. Enough to photograph what a signed-in student sees.
      storageState: {
        cookies: [{
          name: "better-auth.session_token",
          value: token,
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax" as const,
        }],
        origins: [],
      },
    });

    const page = await context.newPage();
    page.on("console", (m) => { if (m.type() === "error") console.log("  console error:", m.text().slice(0, 160)); });

    // Not `networkidle`: the player downloads Pyodide in a worker and streams narration,
    // so the network never goes quiet and the wait would always time out.
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });

    for (let i = 0; i < advance; i += 1) {
      const next = page.locator("button").filter({ hasText: /يلا نبدأ|كمّل|وريني الكود|دوري أكتب|Let|Continue/ }).first();
      if (await next.count()) {
        await next.click();
        await page.waitForTimeout(700);
      }
    }

    // The bakery preloads 25 images before it draws; a screenshot taken first is grey.
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`${BASE}${path} -> ${out} (${width}x${height}@2x)`);
  } finally {
    await browser.close();
    await db.authSession.deleteMany({ where: { id: session.id } });
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`shot failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
