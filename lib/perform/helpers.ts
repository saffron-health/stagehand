import { ObserveResult } from "@/types/stagehand";
import { Page } from "@/types/page";
import { Locator } from "@playwright/test";
import chalk from "chalk";
import fs from "fs/promises";
import { z } from "zod";

type Falsy = null | undefined | false | "" | 0;
type Truthy<T> = Exclude<T, Falsy>;

export async function waitUntilTruthy<T>(
  locator: Locator,
  fn?: (locator: Locator) => Promise<T>,
  timeout: number = 3_000,
): Promise<Truthy<T>> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await locator.waitFor({
        state: "visible",
        timeout: timeout - (Date.now() - startTime),
      });

      let result: T | boolean = true;
      if (fn) {
        result = await fn(locator);
      }

      if (result) {
        return result as Truthy<T>;
      }
    } catch (error) {
      // If waitFor fails with a timeout, we catch it and continue the loop
      // unless the error is something else that should be rethrown.
      if (error instanceof Error && error.message.includes("Timeout")) {
        continue;
      }
      throw error;
    }

    // A small delay to prevent a tight CPU loop if the element isn't there
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Attempted to wait for ${timeout}ms, but matcher still failed for ${locator.toString()}`,
  );
}

/**
 * Get an environment variable and throw an error if it's not found
 * @param name - The name of the environment variable
 * @returns The value of the environment variable
 */
export function getEnvVar(name: string, required = true): string | undefined {
  const value = process.env[name];
  if (!value && required) {
    throw new Error(`${name} not found in environment variables`);
  }
  return value;
}

/**
 * Validate a Zod schema against some data
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns Whether the data is valid against the schema
 */
export function validateZodSchema(schema: z.ZodTypeAny, data: unknown) {
  try {
    schema.parse(data);
    return true;
  } catch {
    return false;
  }
}

export async function drawObserveOverlay(page: Page, results: ObserveResult[]) {
  // Convert single xpath to array for consistent handling
  const xpathList = results.map((result) => result.selector);

  // Filter out empty xpaths
  const validXpaths = xpathList.filter((xpath) => xpath !== "xpath=");

  await page.evaluate((selectors) => {
    selectors.forEach((selector) => {
      let element;
      if (selector.startsWith("xpath=")) {
        const xpath = selector.substring(6);
        // @ts-ignore
        element = document.evaluate(
          xpath,
          // @ts-ignore
          document,
          null,
          // @ts-ignore
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
      } else {
        // @ts-ignore
        element = document.querySelector(selector);
      }

      // @ts-ignore
      if (element instanceof HTMLElement) {
        // @ts-ignore
        const overlay = document.createElement("div");
        overlay.setAttribute("stagehandObserve", "true");
        const rect = element.getBoundingClientRect();
        overlay.style.position = "absolute";
        overlay.style.left = rect.left + "px";
        overlay.style.top = rect.top + "px";
        overlay.style.width = rect.width + "px";
        overlay.style.height = rect.height + "px";
        overlay.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "10000";
        // @ts-ignore
        document.body.appendChild(overlay);
      }
    });
  }, validXpaths);
}

export async function clearOverlays(page: Page) {
  // remove existing stagehandObserve attributes
  await page.evaluate(() => {
    // @ts-ignore
    const elements = document.querySelectorAll('[stagehandObserve="true"]');
    // @ts-ignore
    elements.forEach((el) => {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent?.insertBefore(el.firstChild, el);
      }
      parent?.removeChild(el);
    });
  });
}

export async function simpleCache(
  instruction: string,
  actionToCache: ObserveResult,
) {
  // Save action to cache.json
  try {
    // Read existing cache if it exists
    let cache: Record<string, ObserveResult> = {};
    try {
      const existingCache = await fs.readFile("cache.json", "utf-8");
      cache = JSON.parse(existingCache);
    } catch (_error) {
      // File doesn't exist yet, use empty cache
    }

    // Add new action to cache
    cache[instruction] = actionToCache;

    // Write updated cache to file
    await fs.writeFile("cache.json", JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error(chalk.red("Failed to save to cache:"), error);
  }
}

export async function readCache(
  instruction: string,
): Promise<ObserveResult | null> {
  try {
    const existingCache = await fs.readFile("cache.json", "utf-8");
    const cache: Record<string, ObserveResult> = JSON.parse(existingCache);
    return cache[instruction] || null;
  } catch (_error) {
    return null;
  }
}

/**
 * This function is used to act with a cacheable action.
 * It will first try to get the action from the cache.
 * If not in cache, it will observe the page and cache the result.
 * Then it will execute the action.
 * @param instruction - The instruction to act with.
 */
export async function actWithCache(
  page: Page,
  instruction: string,
): Promise<void> {
  // Try to get action from cache first
  const cachedAction = await readCache(instruction);
  if (cachedAction) {
    console.log(chalk.blue("Using cached action for:"), instruction);
    await page.act(cachedAction);
    return;
  }

  // If not in cache, observe the page and cache the result
  const results = await page.observe(instruction);
  console.log(chalk.blue("Got results:"), results);

  // Cache the playwright action
  const actionToCache = results[0]!;
  console.log(chalk.blue("Taking cacheable action:"), actionToCache);
  await simpleCache(instruction, actionToCache);
  // OPTIONAL: Draw an overlay over the relevant xpaths
  await drawObserveOverlay(page, results);
  await page.waitForTimeout(1000); // Can delete this line, just a pause to see the overlay
  await clearOverlays(page);

  // Execute the action
  await page.act(actionToCache);
}
