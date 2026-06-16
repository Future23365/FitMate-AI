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
      jsonProjectionMaxArrayItems: number;
      jsonProjectionMaxObjectEntries: number;
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
      defaultCandidateCountPerSection: number;
      maxCandidateCountPerSection: number;
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
      /** maxTokens 限制最终回答和结构化 tool call 输出体积；准确度优先阶段调大，避免长结构化收口被截断。 */
      maxTokens: 32_000,
      /** timeoutMs 限制单次 provider 请求等待时间；准确度优先阶段给长上下文留出更宽响应窗口。 */
      timeoutMs: 60_000,
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
      /** maxModelCalls 限制单次聊天最多 provider 模型调用次数；这是调用预算保险丝，不属于模型可见内容截断配置。 */
      maxModelCalls: 16,
      /** maxToolCalls 限制单次聊天最多业务 tool 总执行次数；保持原调用预算，避免放大无目标重复查询。 */
      maxToolCalls: 15,
      /** maxToolCallsPerTool 限制同一业务 tool 的连续调用次数；保持原重复调用上限。 */
      maxToolCallsPerTool: 5,
      /** overallTimeoutMs 是整次 LangChain run 墙钟预算；准确度优先阶段给长候选与 finalization 留出执行时间。 */
      overallTimeoutMs: 90_000,
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
      /** timeoutMs 限制 finalizer 单次模型调用等待时间；准确度优先阶段放宽，避免失败收口因长摘要超时。 */
      timeoutMs: 30_000,
      /** maxTokens 限制 finalizer 回复体积；准确度优先阶段放宽，避免兜底解释被模型输出预算截断。 */
      maxTokens: 4_000,
      /** maxContentLength 限制用户可见兜底正文长度；调大用于完整解释已验证事实和缺口。 */
      maxContentLength: 4_000,
      /** maxSuggestedQuestions 限制 finalizer 可输出的建议问题数量。 */
      maxSuggestedQuestions: 3,
      /** maxSuggestedQuestionLength 限制单条建议问题长度；调大避免健身约束较多时问题被截断。 */
      maxSuggestedQuestionLength: 160,
      /** inputSummaryMaxLength 限制 finalizer 模型输入中每段诊断摘要长度；准确度优先阶段保留更多已验证事实。 */
      inputSummaryMaxLength: 50_000,
      /** maxToolExecutionSummaries 限制传给 finalizer 的 tool 执行摘要数量；调大避免只看到最后少数 tool。 */
      maxToolExecutionSummaries: 20,
    },
    /** toolWrapper 控制所有 LangChain tool wrapper 的默认超时和投影裁剪预算。 */
    toolWrapper: {
      /** defaultTimeoutMs 是单个 wrapper 默认执行预算；准确度优先阶段放宽，避免慢查询被过早打断。 */
      defaultTimeoutMs: 10_000,
      /** modelVisibleSummaryMaxLength 限制返回给模型的 tool result 摘要长度；调大以优先保留完整候选事实。 */
      modelVisibleSummaryMaxLength: 200_000,
      /** userProjectionMaxLength 限制用户投影摘要长度；调大以避免用户可见投影和事实持久化链路过早裁剪。 */
      userProjectionMaxLength: 100_000,
      /** traceSummaryMaxLength 限制 trace 中 tool input/output 摘要长度；finalizer 会消费部分 traceSummary，因此准确度优先阶段调大。 */
      traceSummaryMaxLength: 50_000,
      /** jsonProjectionMaxArrayItems 限制 JSON 投影保留的数组项数；调大避免候选事实在序列化前被固定 20 项裁剪。 */
      jsonProjectionMaxArrayItems: 500,
      /** jsonProjectionMaxObjectEntries 限制 JSON 投影保留的对象字段数；调大避免结构化事实字段在序列化前被固定 30 项裁剪。 */
      jsonProjectionMaxObjectEntries: 200,
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
      /** modelMessagePreviewMaxLength 限制 trace 中消息预览长度；调大便于排查长上下文下模型实际可见输入。 */
      modelMessagePreviewMaxLength: 4_000,
      /** providerPayloadPreviewMaxLength 限制 DeepSeek raw payload 摘要长度；调大便于排查 provider 请求是否完整。 */
      providerPayloadPreviewMaxLength: 20_000,
      /** toolArgumentsPreviewMaxLength 限制 tool arguments 预览；调大便于排查复杂结构化查询。 */
      toolArgumentsPreviewMaxLength: 10_000,
      /** toolResultPreviewMaxLength 限制 tool result 预览；调大便于确认候选事实是否被裁剪。 */
      toolResultPreviewMaxLength: 50_000,
      /** ndjsonProjectionPreviewMaxLength 限制最终用户事件投影摘要长度；调大避免 visible output payload 过早裁剪。 */
      ndjsonProjectionPreviewMaxLength: 100_000,
    },
  },
  /** tools 控制生产 tool 暴露给模型的默认事实数量和超时；业务层仍保留 hard cap。 */
  tools: {
    /** searchExerciseResources 控制动作候选查询的受控返回规模，避免 tool 局部硬编码候选数量。 */
    searchExerciseResources: {
      /** timeoutMs 限制动作事实查询 tool 的单次执行时间；准确度优先阶段放宽，避免大候选查询超时。 */
      timeoutMs: 10_000,
      /** defaultCandidateCountPerSection 是未显式指定时每个请求 section 的候选数量默认值；调大让宽泛查询先给足候选池。 */
      defaultCandidateCountPerSection: 24,
      /** maxCandidateCountPerSection 是模型可控候选数量上限；repository hard cap 必须与它同步或显式更低。 */
      maxCandidateCountPerSection: 80,
    },
    /** inspectVisibleTrainingProposals 控制最近可见训练方案事实索引的读取规模。 */
    inspectVisibleTrainingProposals: {
      /** timeoutMs 限制可见训练方案事实 tool 的单次执行时间；准确度优先阶段放宽，避免事实库慢读过早失败。 */
      timeoutMs: 5_000,
      /** recentFactListLimit 控制 list_recent 返回的最近事实索引数量；调大以保留更多可复用历史训练事实。 */
      recentFactListLimit: 20,
    },
    /** submitVisibleTrainingProposal 控制结构化训练方案终态 validator 的执行预算。 */
    submitVisibleTrainingProposal: {
      /** timeoutMs 限制结构化训练方案校验和用户可见投影生成时间；准确度优先阶段放宽长计划校验窗口。 */
      timeoutMs: 5_000,
    },
  },
} as const satisfies AgentRuntimeConfig;

/** createLangChainJsonProjectionBudget 把不同链路的长度预算与统一结构预算组合，避免调用点继续写固定数组/对象裁剪值。 */
export function createLangChainJsonProjectionBudget(maxLength: number) {
  const toolWrapperConfig = agentRuntimeConfig.langChain.toolWrapper;

  return {
    maxLength,
    maxArrayItems: toolWrapperConfig.jsonProjectionMaxArrayItems,
    maxObjectEntries: toolWrapperConfig.jsonProjectionMaxObjectEntries,
  };
}

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
