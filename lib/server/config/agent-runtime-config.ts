import "server-only";

export type AgentRuntimeConfig = {
  langChain: {
    runtimeVersion: "langchain-agent-runtime-v1";
    model: {
      provider: "deepseek";
      integrationPackage: "@langchain/deepseek";
      defaultModel: string;
      defaultEndpoint: string;
      temperature: number;
      maxTokens: number;
      timeoutMs: number;
      toolCalling: {
        enabled: true;
        toolChoice: "auto";
        strictMode: false;
      };
      thinking: {
        type: "disabled";
      };
    };
    runBudget: {
      maxModelCalls: number;
      maxToolCalls: number;
      maxToolCallsPerTool: number;
      overallTimeoutMs: number;
    };
    runtimeActivity: {
      maxSummaryLength: number;
      maxMetadataEvents: number;
      defaultSummary: string;
    };
    terminalFailureFinalizer: {
      defaultEnabled: boolean;
      timeoutMs: number;
      maxTokens: number;
      maxContentLength: number;
      maxSuggestedQuestions: number;
      maxSuggestedQuestionLength: number;
      inputSummaryMaxLength: number;
      maxToolExecutionSummaries: number;
    };
    toolWrapper: {
      defaultTimeoutMs: number;
      modelVisibleSummaryMaxLength: number;
      userProjectionMaxLength: number;
      traceSummaryMaxLength: number;
    };
    toolCatalog: {
      defaultEnabled: true;
      allowedToolNames: readonly [
        "inspectVisibleTrainingProposals",
        "searchExerciseResources",
        "submitVisibleTrainingProposal",
      ];
    };
    trace: {
      modelMessagePreviewMaxLength: number;
      providerPayloadPreviewMaxLength: number;
      toolArgumentsPreviewMaxLength: number;
      toolResultPreviewMaxLength: number;
      ndjsonProjectionPreviewMaxLength: number;
    };
  };
  tools: {
    searchExerciseResources: {
      timeoutMs: number;
      maxReturnedPerSection: number;
    };
    inspectVisibleTrainingProposals: {
      timeoutMs: number;
      recentFactListLimit: number;
    };
    submitVisibleTrainingProposal: {
      timeoutMs: number;
    };
  };
};

export type LangChainDeepSeekProviderConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
};

export type LangChainDeepSeekProviderEnv = {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_API_URL?: string;
  DEEPSEEK_MODEL?: string;
};

export type LangChainDeepSeekProviderConfigResult =
  | { ok: true; config: LangChainDeepSeekProviderConfig }
  | { ok: false; code: "missing_deepseek_api_key"; message: string };

/** agentRuntimeConfig 集中定义生产 Agent 行为预算；调大这些值会增加模型成本、延迟或上下文体积。 */
export const agentRuntimeConfig = {
  /** langChain 定义新生产 Agent 主链的 LangChain / DeepSeek / tool wrapper 预算，route 和业务 tool 不再局部硬编码运行参数。 */
  langChain: {
    /** runtimeVersion 写入 trace，帮助判断当前请求是否已经脱离旧自研 agent-core。 */
    runtimeVersion: "langchain-agent-runtime-v1",
    /** model 集中管理 DeepSeek native Tool Calling 请求参数，避免 model factory 和 route 重复默认值。 */
    model: {
      /** provider 固定为 deepseek，表达当前生产模型来源；替换 provider 时应先更新 OpenSpec 和 model factory。 */
      provider: "deepseek",
      /** integrationPackage 记录实际使用的 LangChain provider 包，便于 trace 和依赖审计。 */
      integrationPackage: "@langchain/deepseek",
      /** defaultModel 是 native Tool Calling 默认模型；部署仍可用 DEEPSEEK_MODEL 覆盖。 */
      defaultModel: "deepseek-v4-flash",
      /** defaultEndpoint 是 DeepSeek OpenAI-compatible endpoint；部署可用 DEEPSEEK_API_URL 覆盖。 */
      defaultEndpoint: "https://api.deepseek.com",
      /** temperature 越高越容易改变 tool calling 决策；生产默认保持确定性。 */
      temperature: 0,
      /** maxTokens 限制最终回答和 tool 调用上下文的输出体积；调大增加成本和延迟。 */
      maxTokens: 20_000,
      /** timeoutMs 限制单次 provider 请求等待时间；调小会增加慢响应失败，调大增加请求占用。 */
      timeoutMs: 30_000,
      /** toolCalling 控制 provider native tools 暴露方式；schema 正确性仍由 wrapper Zod 校验。 */
      toolCalling: {
        /** enabled 固定 true，生产 LangChain agent 必须使用 DeepSeek native tools，而不是自定义 JSON action。 */
        enabled: true,
        /** toolChoice 使用 auto，让模型基于可见 tools 自主决定调用或直接回答。 */
        toolChoice: "auto",
        /** strictMode 当前不启用 DeepSeek beta strict，避免把服务端合同依赖到 provider beta JSON Schema 子集。 */
        strictMode: false,
      },
      /** thinking 控制 DeepSeek thinking mode；native tool calling 默认禁用推理内容进入生产 trace。 */
      thinking: {
        /** type 固定 disabled，降低 tool calling 延迟并避免 reasoning_content 成为业务事实来源。 */
        type: "disabled",
      },
    },
    /** runBudget 控制 LangChain agent harness 最大推进范围，避免 provider/tool 循环拖垮请求。 */
    runBudget: {
      /** maxModelCalls 限制单次聊天最多 provider 模型调用次数；runtime 也用它推导 LangChain graph recursionLimit。 */
      maxModelCalls: 21,
      /** maxToolCalls 限制单次聊天最多业务 tool 总执行次数；调大增加数据库压力和上下文体积。 */
      maxToolCalls: 20,
      /** maxToolCallsPerTool 限制同一业务 tool 的连续调用次数，避免模型原地重复请求同一能力。 */
      maxToolCallsPerTool: 2,
      /** overallTimeoutMs 是整次 LangChain run 墙钟预算；调大增加请求占用，调小可能中断合法慢路径。 */
      overallTimeoutMs: 40_000,
    },
    /** runtimeActivity 控制业务 tool call metadata 的安全投影边界，不产生独立 provider tool call。 */
    runtimeActivity: {
      /** maxSummaryLength 是 runtimeMetadata.activitySummary 的服务端安全上限；超出时降级到默认摘要。 */
      maxSummaryLength: 80,
      /** maxMetadataEvents 限制单次请求最多投影的 UI metadata 事件数，避免重复摘要刷屏。 */
      maxMetadataEvents: 20,
      /** defaultSummary 是业务 tool 未声明默认摘要时的通用安全兜底。 */
      defaultSummary: "正在处理当前请求",
    },
    /** terminalFailureFinalizer 控制主 Agent 失败后的受限模型兜底回复，不参与业务 tool loop。 */
    terminalFailureFinalizer: {
      /** defaultEnabled 控制生产失败后是否默认尝试模型兜底；关闭时直接走确定性 fallback。 */
      defaultEnabled: true,
      /** timeoutMs 限制 finalizer 单次模型调用等待时间，避免失败收口拖住 stream。 */
      timeoutMs: 12_000,
      /** maxTokens 限制 finalizer 回复体积；finalizer 只输出普通解释和建议问题。 */
      maxTokens: 900,
      /** maxContentLength 限制用户可见兜底正文长度。 */
      maxContentLength: 900,
      /** maxSuggestedQuestions 限制 finalizer 可输出的建议问题数量。 */
      maxSuggestedQuestions: 3,
      /** maxSuggestedQuestionLength 限制单条建议问题长度。 */
      maxSuggestedQuestionLength: 80,
      /** inputSummaryMaxLength 限制 finalizer 模型输入中每段诊断摘要长度。 */
      inputSummaryMaxLength: 1_200,
      /** maxToolExecutionSummaries 限制传给 finalizer 的 tool 执行摘要数量。 */
      maxToolExecutionSummaries: 6,
    },
    /** toolWrapper 控制所有 LangChain tool wrapper 的默认超时和投影裁剪预算。 */
    toolWrapper: {
      /** defaultTimeoutMs 是单个 wrapper 默认执行预算；具体 tool 仍可用更低 hard cap。 */
      defaultTimeoutMs: 2_000,
      /** modelVisibleSummaryMaxLength 限制返回给模型的 tool result 摘要长度。 */
      modelVisibleSummaryMaxLength: 8_000,
      /** userProjectionMaxLength 限制用户投影摘要长度，避免大 payload 直接进入 NDJSON。 */
      userProjectionMaxLength: 4_000,
      /** traceSummaryMaxLength 限制 trace 中 tool input/output 摘要长度，降低泄漏面。 */
      traceSummaryMaxLength: 1_200,
    },
    /** toolCatalog 声明生产 LangChain tools 白名单，route 不根据用户原文动态增减工具。 */
    toolCatalog: {
      /** defaultEnabled 控制生产 tool catalog 是否默认可用；关闭时只允许基础文本回答。 */
      defaultEnabled: true,
      /** allowedToolNames 是当前 OpenSpec 声明的生产业务 tool 集合，不包含 fixture 或独立 activity tool。 */
      allowedToolNames: [
        "inspectVisibleTrainingProposals",
        "searchExerciseResources",
        "submitVisibleTrainingProposal",
      ],
    },
    /** trace 控制 LangChain runtime、provider payload、tool wrapper 和 NDJSON projection 的诊断裁剪。 */
    trace: {
      /** modelMessagePreviewMaxLength 限制 trace 中消息预览长度，避免保存完整历史。 */
      modelMessagePreviewMaxLength: 800,
      /** providerPayloadPreviewMaxLength 限制 DeepSeek raw payload 摘要长度，避免泄漏完整请求。 */
      providerPayloadPreviewMaxLength: 1_200,
      /** toolArgumentsPreviewMaxLength 限制 tool arguments 预览，避免模型参数原样进 trace。 */
      toolArgumentsPreviewMaxLength: 800,
      /** toolResultPreviewMaxLength 限制 tool result 预览，避免完整 handler output 进 trace。 */
      toolResultPreviewMaxLength: 1_200,
      /** ndjsonProjectionPreviewMaxLength 限制最终用户事件投影摘要长度。 */
      ndjsonProjectionPreviewMaxLength: 800,
    },
  },
  /** tools 控制生产 tool 暴露给模型的默认事实数量和超时；业务层仍保留 hard cap。 */
  tools: {
    /** searchExerciseResources 控制每个 section 返回给模型的动作事实数量。 */
    searchExerciseResources: {
      /** timeoutMs 限制动作事实查询 tool 的单次执行时间；调大可能放大慢查询影响。 */
      timeoutMs: 2_000,
      /** maxReturnedPerSection 控制每个 warmup/training/stretch section 的可见动作数量；调大增加模型上下文体积。 */
      maxReturnedPerSection: 8,
    },
    /** inspectVisibleTrainingProposals 控制最近可见训练方案事实索引的读取规模。 */
    inspectVisibleTrainingProposals: {
      /** timeoutMs 限制可见训练方案事实 tool 的单次执行时间；调大可能放大事实库慢读影响。 */
      timeoutMs: 2_000,
      /** recentFactListLimit 控制 list_recent 返回的最近事实索引数量；调大增加模型上下文和引用歧义。 */
      recentFactListLimit: 3,
    },
    /** submitVisibleTrainingProposal 控制结构化训练方案终态 validator 的执行预算。 */
    submitVisibleTrainingProposal: {
      /** timeoutMs 限制结构化训练方案校验和用户可见投影生成时间，失败时不输出卡片。 */
      timeoutMs: 3_000,
    },
  },
} as const satisfies AgentRuntimeConfig;

/** resolveLangChainDeepSeekProviderConfig 集中解析 DeepSeek 部署环境变量，route 和 model factory 不直接读 env。 */
export function resolveLangChainDeepSeekProviderConfig(
  env: LangChainDeepSeekProviderEnv = readLangChainDeepSeekProviderEnv(),
): LangChainDeepSeekProviderConfigResult {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();

  if (!apiKey) {
    return {
      ok: false,
      code: "missing_deepseek_api_key",
      message: "DEEPSEEK_API_KEY is required to create the LangChain DeepSeek model.",
    };
  }

  return {
    ok: true,
    config: {
      apiKey,
      endpoint: env.DEEPSEEK_API_URL?.trim() || agentRuntimeConfig.langChain.model.defaultEndpoint,
      model: env.DEEPSEEK_MODEL?.trim() || agentRuntimeConfig.langChain.model.defaultModel,
    },
  };
}

function readLangChainDeepSeekProviderEnv(): LangChainDeepSeekProviderEnv {
  return {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_API_URL: process.env.DEEPSEEK_API_URL,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  };
}
