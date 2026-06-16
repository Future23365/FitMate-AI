import "server-only";

import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  buildLangChainAgentSystemPrompt,
  createProductionLangChainToolCatalog,
  getLangChainToolProviderInputSchema,
  langChainFinalResponseJsonSchema,
  langChainFinalResponseToolName,
  type LangChainToolWrapper,
} from "@/lib/server/langchain-agent";
import type {
  ShadowJsonValue,
  ShadowLlmProbeInput,
  ShadowLlmProbeMessage,
  ShadowLlmProbeToolContract,
} from "@/lib/shared/shadow-llm-probe/schema";
import {
  ShadowLlmProbeInputSchema,
} from "@/lib/shared/shadow-llm-probe/schema";

export type CreateShadowLlmProbeInputOptions = {
  runId: string;
  roundId: string;
  message: string;
  messages?: readonly ShadowLlmProbeMessage[];
  toolResultSummaries?: ShadowLlmProbeInput["toolResultSummaries"];
  toolWrappers?: readonly LangChainToolWrapper[];
  createdAt?: Date;
  toolCallsUsed?: number;
};

/** createShadowLlmProbeInput 导出模型可见白名单输入，不读取 trace、源码实现或 handler raw output。 */
export function createShadowLlmProbeInput(options: CreateShadowLlmProbeInputOptions): ShadowLlmProbeInput {
  const config = agentRuntimeConfig;
  const toolWrappers = options.toolWrappers ?? createProductionLangChainToolCatalog();
  const roundIndex = Number(options.roundId.replace("round-", ""));
  const input = {
    schemaVersion: 1,
    runId: options.runId,
    roundId: options.roundId,
    createdAt: (options.createdAt ?? new Date()).toISOString(),
    inputSource: {
      kind: "single_message",
      messagePreview: previewText(options.message),
    },
    systemPrompt: buildLangChainAgentSystemPrompt(),
    messages: options.messages ? [...options.messages] : [{ role: "user", content: options.message }],
    tools: toolWrappers.map(createToolContract),
    finalizationTool: createFinalizationToolContract(),
    toolResultSummaries: options.toolResultSummaries ?? [],
    budget: {
      roundIndex,
      maxRounds: config.shadowLlmProbe.maxRounds,
      maxToolCalls: config.langChain.runBudget.maxToolCalls,
      remainingToolCalls: Math.max(config.langChain.runBudget.maxToolCalls - (options.toolCallsUsed ?? 0), 0),
      maxModelCalls: config.langChain.runBudget.maxModelCalls,
    },
    sourceRefs: [],
  } satisfies Omit<ShadowLlmProbeInput, "sourceRefs"> & { sourceRefs: [] };

  const withRefs = {
    ...input,
    sourceRefs: createSourceRefs(input),
  };

  return ShadowLlmProbeInputSchema.parse(withRefs);
}

function createToolContract(wrapper: LangChainToolWrapper): ShadowLlmProbeToolContract {
  const providerInputSchema = getLangChainToolProviderInputSchema(wrapper);
  const jsonSchema = z.toJSONSchema(providerInputSchema) as ShadowJsonValue;

  return {
    name: wrapper.name,
    description: wrapper.description,
    inputSchema: jsonSchema,
    schemaDescriptions: collectSchemaDescriptions(jsonSchema, "$.inputSchema"),
  };
}

function createFinalizationToolContract(): ShadowLlmProbeToolContract {
  const inputSchema = langChainFinalResponseJsonSchema as ShadowJsonValue;

  return {
    name: langChainFinalResponseToolName,
    description: typeof langChainFinalResponseJsonSchema.description === "string"
      ? langChainFinalResponseJsonSchema.description
      : "FitMate 聊天成功终态。",
    inputSchema,
    schemaDescriptions: collectSchemaDescriptions(inputSchema, "$.finalizationTool.inputSchema"),
  };
}

function createSourceRefs(input: Omit<ShadowLlmProbeInput, "sourceRefs">): ShadowLlmProbeInput["sourceRefs"] {
  const refs: ShadowLlmProbeInput["sourceRefs"] = [
    { id: "systemPrompt", path: "$.systemPrompt", label: "生产 system prompt" },
    { id: "messages", path: "$.messages", label: "当前模型可见消息" },
    { id: "tools", path: "$.tools", label: "当前 request 暴露的业务 tools" },
    { id: "finalizationTool", path: "$.finalizationTool", label: "结构化最终回答工具" },
    { id: "budget", path: "$.budget", label: "模型可见运行预算" },
  ];

  input.messages.forEach((_, index) => {
    refs.push({ id: `message-${index + 1}`, path: `$.messages[${index}].content`, label: `消息 ${index + 1}` });
  });

  input.tools.forEach((tool, index) => {
    refs.push({ id: `tool-${tool.name}`, path: `$.tools[${index}]`, label: `业务 tool ${tool.name}` });
    refs.push({ id: `tool-${tool.name}-description`, path: `$.tools[${index}].description`, label: `${tool.name} description` });
    refs.push({ id: `tool-${tool.name}-schema`, path: `$.tools[${index}].inputSchema`, label: `${tool.name} input schema` });
  });

  input.toolResultSummaries.forEach((summary, index) => {
    refs.push({
      id: `tool-result-${summary.roundId}`,
      path: `$.toolResultSummaries[${index}].content`,
      label: `${summary.roundId} 模型可见 tool result summary`,
    });
  });

  return refs;
}

function collectSchemaDescriptions(value: ShadowJsonValue, rootPath: string): ShadowLlmProbeToolContract["schemaDescriptions"] {
  const descriptions: ShadowLlmProbeToolContract["schemaDescriptions"] = [];

  visitJson(value, rootPath, (node, path) => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      const description = node.description;
      if (typeof description === "string" && description.trim()) {
        descriptions.push({ path, description });
      }
    }
  });

  return descriptions;
}

function visitJson(value: ShadowJsonValue, path: string, visit: (value: Record<string, ShadowJsonValue>, path: string) => void) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => visitJson(item, `${path}[${index}]`, visit));
    return;
  }

  visit(value, path);
  for (const [key, child] of Object.entries(value)) {
    visitJson(child, `${path}.${key}`, visit);
  }
}

function previewText(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}
