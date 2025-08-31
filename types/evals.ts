import { z } from "zod/v3";
import type { AvailableModel } from "../types/model";
import type { LogLine } from "../types/log";
import type { AgentInstance } from "../types/agent";
import type { EvalCase } from "braintrust";
import { Stagehand } from "@/dist";
import { ConstructorParams } from "@/dist";
import { EvalLogger } from "@/evals/logger";

export type StagehandInitResult = {
  stagehand: Stagehand;
  logger: EvalLogger;
  debugUrl: string;
  sessionUrl: string;
  stagehandConfig: ConstructorParams;
  modelName: AvailableModel;
  agent: AgentInstance;
};

export type EvalFunction = (
  taskInput: StagehandInitResult & { input: EvalInput },
) => Promise<{
  _success: boolean;
  logs: LogLine[];
  debugUrl: string;
  sessionUrl: string;
  error?: unknown;
}>;

export const EvalCategorySchema = z.enum([
  "observe",
  "act",
  "combination",
  "extract",
  "experimental",
  "targeted_extract",
  "regression",
  "regression_llm_providers",
  "llm_clients",
  "agent",
  "external_agent_benchmarks",
]);

export type EvalCategory = z.infer<typeof EvalCategorySchema>;
export interface EvalInput {
  name: string;
  modelName: AvailableModel;
  // Optional per-test parameters, used by data-driven tasks
  params?: Record<string, unknown>;
}

export interface Testcase
  extends EvalCase<
    EvalInput,
    unknown,
    { model: AvailableModel; test: string; categories?: string[] }
  > {
  input: EvalInput;
  name: string;
  tags: string[];
  metadata: { model: AvailableModel; test: string; categories?: string[] };
  expected: unknown;
}

export interface SummaryResult {
  input: EvalInput;
  output: { _success: boolean };
  name: string;
  score: number;
}

export interface EvalArgs<TInput, TOutput, TExpected> {
  input: TInput;
  output: TOutput;
  expected: TExpected;
  metadata?: { model: AvailableModel; test: string };
}

export interface EvalResult {
  name: string;
  score: number;
}

export type LogLineEval = LogLine & {
  parsedAuxiliary?: string | object;
};
