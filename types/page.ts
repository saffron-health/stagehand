import type {
  Browser as PlaywrightBrowser,
  BrowserContext as PlaywrightContext,
  Page as PlaywrightPage,
} from "playwright";
import { z } from "zod";
import type {
  ActOptions,
  ActResult,
  ExtractOptions,
  ExtractResult,
  ObserveOptions,
  ObserveResult,
} from "./stagehand";

export const defaultExtractSchema = z.object({
  extraction: z.string(),
});

export const pageTextSchema = z.object({
  page_text: z.string(),
});

export interface Page extends Omit<PlaywrightPage, "on"> {
  act(action: string): Promise<ActResult>;
  act(options: ActOptions): Promise<ActResult>;
  act(observation: ObserveResult): Promise<ActResult>;

  extract(
    instruction: string,
  ): Promise<ExtractResult<typeof defaultExtractSchema>>;
  extract<T extends z.AnyZodObject>(
    options: ExtractOptions<T>,
  ): Promise<ExtractResult<T>>;
  extract(): Promise<ExtractResult<typeof pageTextSchema>>;

  observe(): Promise<ObserveResult[]>;
  observe(instruction: string): Promise<ObserveResult[]>;
  observe(options?: ObserveOptions): Promise<ObserveResult[]>;

  // TypeScript overloads for perform method
  perform(
    selectors: string[],
    method: "click" | "dblclick" | "hover" | "focus" | "blur" | "press" | "type" | "fill" | "clear" | "check" | "uncheck" | "selectOption" | "selectText" | "setInputFiles" | "tap" | "dragTo" | "scrollIntoViewIfNeeded",
    timeout: number,
    description: string,
  ): Promise<void>;
  
  perform(
    selectors: string[],
    method: "innerText" | "textContent" | "innerHTML" | "inputValue" | "value",
    timeout: number,
    description: string,
  ): Promise<string | null>;
  
  perform(
    selectors: string[],
    method: "isVisible" | "isEnabled" | "isChecked" | "isDisabled" | "isEditable" | "isHidden",
    timeout: number,
    description: string,
  ): Promise<boolean>;
  
  perform(
    selectors: string[],
    method: "count",
    timeout: number,
    description: string,
  ): Promise<number>;
  
  perform(
    selectors: string[],
    method: "boundingBox",
    timeout: number,
    description: string,
  ): Promise<{ x: number; y: number; width: number; height: number } | null>;
  
  perform(
    selectors: string[],
    method: `getAttribute:${string}`,
    timeout: number,
    description: string,
  ): Promise<string | null>;
  
  perform(
    selectors: string[],
    method: string,
    timeout: number,
    description: string,
  ): Promise<unknown>;

  on: {
    (event: "popup", listener: (page: Page) => unknown): Page;
  } & PlaywrightPage["on"];
}

// Empty type for now, but will be used in the future
export type BrowserContext = PlaywrightContext;

// Empty type for now, but will be used in the future
export type Browser = PlaywrightBrowser;
