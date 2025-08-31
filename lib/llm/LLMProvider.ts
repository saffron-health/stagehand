import { AISDKCustomProvider, AISDKProvider } from "@/types/llm";
import {
  UnsupportedAISDKModelProviderError,
  UnsupportedModelError,
  UnsupportedModelProviderError,
} from "@/types/stagehandErrors";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { azure, createAzure } from "@ai-sdk/azure";
import { cerebras, createCerebras } from "@ai-sdk/cerebras";
import { createDeepSeek, deepseek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createGroq, groq } from "@ai-sdk/groq";
import { createMistral, mistral } from "@ai-sdk/mistral";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createPerplexity, perplexity } from "@ai-sdk/perplexity";
import { createTogetherAI, togetherai } from "@ai-sdk/togetherai";
import { createXai, xai } from "@ai-sdk/xai";
import { ollama } from "ollama-ai-provider";
import { LogLine } from "../../types/log";
import {
  AvailableModel,
  ClientOptions,
  ModelProvider,
} from "../../types/model";
import { LLMCache } from "../cache/LLMCache";
import { AISdkClient } from "./aisdk";
import { AnthropicClient } from "./AnthropicClient";
import { CerebrasClient } from "./CerebrasClient";
import { GoogleClient } from "./GoogleClient";
import { GoogleVertexClient } from "./GoogleVertexClient";
import { GroqClient } from "./GroqClient";
import { LLMClient } from "./LLMClient";
import { OpenAIClient } from "./OpenAIClient";

const AISDKProviders: Record<string, AISDKProvider> = {
  openai,
  anthropic,
  google,
  xai,
  azure,
  groq,
  cerebras,
  togetherai,
  mistral,
  deepseek,
  perplexity,
  ollama,
};
const AISDKProvidersWithAPIKey: Record<string, AISDKCustomProvider> = {
  openai: createOpenAI,
  anthropic: createAnthropic,
  google: createGoogleGenerativeAI,
  xai: createXai,
  azure: createAzure,
  groq: createGroq,
  cerebras: createCerebras,
  togetherai: createTogetherAI,
  mistral: createMistral,
  deepseek: createDeepSeek,
  perplexity: createPerplexity,
};

const modelToProviderMap: { [key in AvailableModel]: ModelProvider } = {
  "gpt-4.1": "openai",
  "gpt-4.1-mini": "openai",
  "gpt-4.1-nano": "openai",
  "o4-mini": "openai",
  //prettier-ignore
  "o3": "openai",
  "o3-mini": "openai",
  //prettier-ignore
  "o1": "openai",
  "o1-mini": "openai",
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-4o-2024-08-06": "openai",
  "gpt-4.5-preview": "openai",
  "o1-preview": "openai",
  "claude-3-5-sonnet-latest": "anthropic",
  "claude-3-5-sonnet-20240620": "anthropic",
  "claude-3-5-sonnet-20241022": "anthropic",
  "claude-3-7-sonnet-20250219": "anthropic",
  "claude-3-7-sonnet-latest": "anthropic",
  "cerebras-llama-3.3-70b": "cerebras",
  "cerebras-llama-3.1-8b": "cerebras",
  "groq-llama-3.3-70b-versatile": "groq",
  "groq-llama-3.3-70b-specdec": "groq",
  "moonshotai/kimi-k2-instruct": "groq",
  "gemini-1.5-flash": "google",
  "gemini-1.5-pro": "google",
  "gemini-1.5-flash-8b": "google",
  "gemini-2.0-flash-lite": "google",
  "gemini-2.0-flash": "google",
  "gemini-2.5-flash-preview-04-17": "google",
  "gemini-2.5-flash": "google",
  "gemini-2.5-pro-preview-03-25": "google",
  "gemini-2.5-pro": "google",
};

function isVertexAIRequest(clientOptions?: ClientOptions): boolean {
  return !!(
    clientOptions &&
    "vertexai" in clientOptions &&
    clientOptions.vertexai
  );
}

export function getAISDKLanguageModel(
  subProvider: string,
  subModelName: string,
  apiKey?: string,
  clientOptions?: ClientOptions,
) {
  // If this is a google model with vertex AI configuration, don't use AI SDK
  if (subProvider === "google" && isVertexAIRequest(clientOptions)) {
    throw new Error(
      "Vertex AI models should use GoogleVertexClient, not AI SDK",
    );
  }
  if (apiKey) {
    const creator = AISDKProvidersWithAPIKey[subProvider];
    if (!creator) {
      throw new UnsupportedAISDKModelProviderError(
        subProvider,
        Object.keys(AISDKProvidersWithAPIKey),
      );
    }
    // Create the provider instance with the API key and baseURL if provided
    const providerConfig: { apiKey: string; baseURL?: string } = { apiKey };
    if (baseURL) {
      providerConfig.baseURL = baseURL;
    }
    const provider = creator(providerConfig);
    // Get the specific model from the provider
    return provider(subModelName);
  } else {
    const provider = AISDKProviders[subProvider];
    if (!provider) {
      throw new UnsupportedAISDKModelProviderError(
        subProvider,
        Object.keys(AISDKProviders),
      );
    }
    return provider(subModelName);
  }
}

export class LLMProvider {
  private logger: (message: LogLine) => void;
  private enableCaching: boolean;
  private cache: LLMCache | undefined;

  constructor(logger: (message: LogLine) => void, enableCaching: boolean) {
    this.logger = logger;
    this.enableCaching = enableCaching;
    this.cache = enableCaching ? new LLMCache(logger) : undefined;
  }

  cleanRequestCache(requestId: string): void {
    if (!this.enableCaching) {
      return;
    }

    this.logger({
      category: "llm_cache",
      message: "cleaning up cache",
      level: 1,
      auxiliary: {
        requestId: {
          value: requestId,
          type: "string",
        },
      },
    });
    this.cache.deleteCacheForRequestId(requestId);
  }

  getClient(
    modelName: AvailableModel,
    clientOptions?: ClientOptions,
  ): LLMClient {
    if (modelName.includes("/")) {
      const firstSlashIndex = modelName.indexOf("/");
      const subProvider = modelName.substring(0, firstSlashIndex);
      const subModelName = modelName.substring(firstSlashIndex + 1);

      // Check if this is a vertex AI request for google models
      if (subProvider === "google" && isVertexAIRequest(clientOptions)) {
        return new GoogleVertexClient({
          logger: this.logger,
          enableCaching: this.enableCaching,
          cache: this.cache,
          modelName: modelName,
          clientOptions,
        });
      }

      const languageModel = getAISDKLanguageModel(
        subProvider,
        subModelName,
        clientOptions?.apiKey,
        clientOptions,
      );

      return new AISdkClient({
        model: languageModel,
        logger: this.logger,
        enableCaching: this.enableCaching,
        cache: this.cache,
      });
    }

    const provider = modelToProviderMap[modelName];
    if (!provider) {
      throw new UnsupportedModelError(Object.keys(modelToProviderMap));
    }
    const availableModel = modelName as AvailableModel;
    switch (provider) {
      case "openai":
        return new OpenAIClient({
          logger: this.logger,
          enableCaching: this.enableCaching,
          cache: this.cache,
          modelName: availableModel,
          clientOptions,
        });
      case "anthropic":
        return new AnthropicClient({
          logger: this.logger,
          enableCaching: this.enableCaching,
          cache: this.cache,
          modelName: availableModel,
          clientOptions,
        });
      case "cerebras":
        return new CerebrasClient({
          logger: this.logger,
          enableCaching: this.enableCaching,
          cache: this.cache,
          modelName: availableModel,
          clientOptions,
        });
      case "groq":
        return new GroqClient({
          logger: this.logger,
          enableCaching: this.enableCaching,
          cache: this.cache,
          modelName: availableModel,
          clientOptions,
        });
      case "google":
        return new GoogleClient({
          logger: this.logger,
          enableCaching: this.enableCaching,
          cache: this.cache,
          modelName: availableModel,
          clientOptions,
        });
      default:
        throw new UnsupportedModelProviderError([
          ...new Set(Object.values(modelToProviderMap)),
        ]);
    }
  }

  static getModelProvider(
    modelName: AvailableModel,
    usingOriginalProvider: boolean,
  ): ModelProvider {
    if (modelName.includes("/") && !usingOriginalProvider) {
      const firstSlashIndex = modelName.indexOf("/");
      const subProvider = modelName.substring(0, firstSlashIndex);
      if (AISDKProviders[subProvider]) {
        return "aisdk";
      }
    }
    const provider = modelToProviderMap[modelName];
    return provider;
  }
}
