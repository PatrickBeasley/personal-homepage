#!/usr/bin/env node

/**
 * Playwright Testing Workflow for Phase 3 Pages
 * 
 * This demonstrates how to use Playwright MCP to validate web pages during development.
 * Run with: npx ts-node scripts/test-pages.ts
 */

import { chromium, Browser, Page } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const PAGES_TO_TEST = [
  {
    path: "/",
    title: "Patrick Beasley | Full-Stack Engineer",
    description:
      "Full-stack engineer focused on building clean, performant web applications",
  },
  {
    path: "/resume",
    title: "Resume | Patrick Beasley",
    description: "Full-stack engineer with expertise in Next.js",
  },
  {
    path: "/projects",
    title: "Projects | Patrick Beasley",
    description: "Portfolio of web development projects",
  },
  {
    path: "/blog",
    title: "Blog | Patrick Beasley",
    description:
      "Articles about web development, full-stack engineering, system design",
  },
  {
    path: "/privacy",
    title: "Privacy Policy | Patrick Beasley",
    description:
      "Privacy policy for patrickbeasley.com outlining data collection",
  },
];

async function testPages() {
  let browser: Browser;

  try {
    console.log("🚀 Starting Playwright browser...");
    browser = await chromium.launch({ headless: true });

    for (const page of PAGES_TO_TEST) {
      console.log(`\n📄 Testing: ${page.path}`);
      const browserPage: Page = await browser.newPage();

      try {
        // Navigate to page
        await browserPage.goto(`${BASE_URL}${page.path}`, {
          waitUntil: "domcontentloaded",
        });

        // Verify page title
        const title = await browserPage.title();
        console.log(`   Title: ${title}`);
        if (!title.includes(page.title.split(" |")[0])) {
          console.warn(`   ⚠️  Title mismatch. Expected: "${page.title}"`);
        }

        // Check for console errors
        const errors: string[] = [];
        browserPage.on("console", (msg) => {
          if (msg.type() === "error") {
            errors.push(msg.text());
          }
        });

        // Verify meta description
        const description = await browserPage.locator(
          'meta[name="description"]'
        );
        if (await description.count()) {
          const content = await description.getAttribute("content");
          console.log(`   Description: ${content?.substring(0, 60)}...`);
        }

        // Check OG tags
        const ogTitle = await browserPage
          .locator('meta[property="og:title"]')
          .getAttribute("content");
        if (ogTitle) {
          console.log(`   ✅ OG:title present`);
        }

        if (errors.length > 0) {
          console.error(`   ❌ Console errors found:`);
          errors.forEach((e) => console.error(`      ${e}`));
        } else {
          console.log(`   ✅ No console errors`);
        }

        // Check for broken links on homepage
        if (page.path === "/") {
          const links = await browserPage.locator("a[href^='/']").all();
          console.log(`   Found ${links.length} internal links`);
        }
      } catch (error) {
        console.error(
          `   ❌ Error testing ${page.path}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
        await browserPage.close();
      }
    }

    console.log("\n✅ Testing complete!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run tests
testPages();
