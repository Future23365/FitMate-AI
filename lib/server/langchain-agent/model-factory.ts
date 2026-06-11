import "server-only";

import { ChatDeepSeek } from "@langchain/deepseek";

import {
  agentRuntimeConfig,
  resolveLangChainDeepSeekProviderConfig,
  type LangChainDeepSeekProviderConfigResult,
} from "@/lib/server/config";

import type { LangChainAgentModel } from "./types";

export type LangChainDeepSeekModelFactoryInput = {
  env?: Partial<Pick<NodeJS.ProcessEnv, "DEEPSEEK_API_KEY" | "DEEPSEEK_API_URL" | "DEEPSEEK_MODEL">>;
  providerConfigResult?: LangChainDeepSeekProviderConfigResult;
};

export type LangChainDeepSeekModelFactoryResult =
  | { ok: true; model: LangChainAgentModel; modelName: string; endpoint: string }
  | { ok: false; code: "config_missing"; message: string; retryable: false };

/** createLangChainDeepSeekModel 从集中配置构造 ChatDeepSeek，不在 route 或 runtime 局部解析环境变量。 */
export function createLangChainDeepSeekModel(
  input: LangChainDeepSeekModelFactoryInput = {},
): LangChainDeepSeekModelFactoryResult {
  const runtimeConfig = agentRuntimeConfig.langChain;
  const providerConfig = input.providerConfigResult ?? resolveLangChainDeepSeekProviderConfig(input.env);

  if (!providerConfig.ok) {
    return {
      ok: false,
      code: "config_missing",
      message: providerConfig.message,
      retryable: false,
    };
  }

  const model = new ChatDeepSeek({
    apiKey: providerConfig.config.apiKey,
    model: providerConfig.config.model,
    temperature: runtimeConfig.model.temperature,
    maxTokens: runtimeConfig.model.maxTokens,
    timeout: runtimeConfig.model.timeoutMs,
    modelKwargs: {
      thinking: runtimeConfig.model.thinking,
    },
    configuration: {
      baseURL: providerConfig.config.endpoint,
    },
  });

  return {
    ok: true,
    model,
    modelName: providerConfig.config.model,
    endpoint: providerConfig.config.endpoint,
  };
}
