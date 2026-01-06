#!/usr/bin/env bun
/**
 * Generate PNG screenshots from OG image HTML templates
 * Usage: bun scripts/og-screenshots.ts [--file og-template.html]
 */

import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { type Browser, chromium } from "playwright";

const OG_DIR = join(import.meta.dir, "../website/assets/images/og");

async function screenshot(browser: Browser, htmlFile: string): Promise<void> {
  const page = await browser.newPage();

  // OG images are 1200x630
  await page.setViewportSize({ width: 1200, height: 630 });

  const htmlPath = join(OG_DIR, htmlFile);
  const pngPath = htmlPath.replace(/\.html$/, ".png");

  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

  // Wait for fonts to load
  await page.waitForTimeout(500);

  await page.screenshot({
    path: pngPath,
    type: "png",
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });

  await page.close();

  const name = basename(htmlPath, ".html");
  console.log(`✓ ${name}.png`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: bun scripts/og-screenshots.ts [options]

Options:
  -f, --file <name>  Screenshot single file (e.g., og-template.html)
  -h, --help         Show this help

Examples:
  bun scripts/og-screenshots.ts              # All HTML files
  bun scripts/og-screenshots.ts -f og-api    # Single file (with or without .html)
`);
    process.exit(0);
  }

  // Get HTML files
  const glob = new Bun.Glob("og-*.html");
  const allFiles = Array.from(glob.scanSync(OG_DIR));

  let files: string[];
  if (values.file) {
    const target = values.file.endsWith(".html")
      ? values.file
      : `${values.file}.html`;
    if (!allFiles.includes(target)) {
      console.error(`File not found: ${target}`);
      console.error(`Available: ${allFiles.join(", ")}`);
      process.exit(1);
    }
    files = [target];
  } else {
    files = allFiles.sort();
  }

  console.log(`Generating ${files.length} OG image(s)...\n`);

  // Launch browser once, reuse for all screenshots
  const browser = await chromium.launch();

  try {
    for (const file of files) {
      await screenshot(browser, file);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. PNGs saved to website/assets/images/og/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
