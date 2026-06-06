import "server-only";

export type AgentRuntimeConfig = {
  llm: {
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    deepSeek: {
      defaultModel: string;
      thinking: {
        defaultEnabled: boolean;
        reasoningEffort: "high" | "max";
      };
    };
  };
  terminalFailureFinalizer: {
    enabled: boolean;
    maxCallsPerRun: number;
    timeoutMs: number;
    maxTokens: number;
    temperature: number;
    maxSuggestedQuestions: number;
    deepSeek: {
      thinkingType: "disabled";
    };
  };
  runtime: {
    maxSteps: number;
    maxPlannerCalls: number;
    maxToolCalls: number;
    maxInvalidActions: number;
    maxRepairAttempts: number;
    overallTimeoutMs: number;
    perToolTimeoutMs: number;
  };
  tools: {
    searchExerciseResources: {
      timeoutMs: number;
      maxReturnedPerSection: number;
    };
    resolveExerciseResourceMentions: {
      timeoutMs: number;
      maxMatches: number;
    };
    inspectVisibleTrainingProposals: {
      timeoutMs: number;
      recentFactListLimit: number;
    };
  };
  trace: {
    modelTraceMaxStringLength: number;
    modelTraceLongTextChunkLength: number;
    modelTracePreviewEdgeLength: number;
  };
};

/** agentRuntimeConfig 集中定义生产 Agent 行为预算；调大这些值会增加模型成本、延迟或上下文体积。 */
export const agentRuntimeConfig = {
  /** llm 控制 provider 无关的模型请求默认值，DeepSeek 只负责把它们映射到厂商请求体。 */
  llm: {
    /** temperature 越高越容易发散；生产 Planner 默认保持确定性，避免同一上下文下动作规划漂移。 */
    temperature: 0,
    /** maxTokens 限制单次 AgentAction 输出长度；调大可能增加成本，调小可能截断 visibleOutputs 或 repair 信息。 */
    maxTokens: 10_000,
    /** timeoutMs 限制单次模型请求等待时间；调大增加用户等待，调小会放大慢响应的失败率。 */
    timeoutMs: 30_000,
    /** deepSeek 集中保存 DeepSeek provider 专有请求策略，避免 adapter 局部散落模型名和推理强度。 */
    deepSeek: {
      /** defaultModel 是生产 Planner 的默认 DeepSeek 模型；部署环境仍可用 DEEPSEEK_MODEL 覆盖最终请求 model。 */
      defaultModel: "deepseek-v4-flash",
      /** thinking 控制 DeepSeek Thinking Mode；开启会增加推理深度、延迟、成本，并影响 AgentAction 输出稳定性。 */
      thinking: {
        /** defaultEnabled 只表达 provider thinking 默认开关，不参与业务 tool、训练结构或服务端语义分流。 */
        defaultEnabled: true,
        /** reasoningEffort 控制 Thinking Mode 推理强度；调高会增加 reasoning token、等待时间和成本。 */
        reasoningEffort: "high",
      },
    },
  },
  /** terminalFailureFinalizer 控制主 Agent 失败后的单次自然语言收口，独立于主 repair 预算。 */
  terminalFailureFinalizer: {
    /** enabled 关闭时直接使用确定性 fallback，避免额外模型成本和延迟。 */
    enabled: true,
    /** maxCallsPerRun 限制每次主 run 最多调用一次 finalizer，避免失败后进入新 retry 循环。 */
    maxCallsPerRun: 1,
    /** timeoutMs 限制 finalizer 等待时间，保障前端仍能在当前请求内看到终态回复。 */
    timeoutMs: 3_000,
    /** maxTokens 限制失败解释和建议问题长度，避免输出变成长篇诊断或增加不必要成本。 */
    maxTokens: 500,
    /** temperature 保持低随机性，让失败回复更稳定，并降低承诺已完成的概率。 */
    temperature: 0.2,
    /** maxSuggestedQuestions 控制下一轮建议问题数量，保证 UI 清晰且不会挤占聊天空间。 */
    maxSuggestedQuestions: 3,
    /** deepSeek 约束失败收口模型的 provider 参数；finalizer 只做低延迟失败解释，显式禁用 Thinking Mode。 */
    deepSeek: {
      /** thinkingType 固定 disabled，避免失败收口阶段产生或保存 reasoning_content。 */
      thinkingType: "disabled",
    },
  },
  /** runtime 控制 agent-core 主循环预算；这些值决定 repair、tool calling 和最终收口最多能推进多远。 */
  runtime: {
    /** maxSteps 是单次 run 的总循环步数上限；调大可能隐藏循环问题，调小可能阻断合法多工具流程。 */
    maxSteps: 22,
    /** maxPlannerCalls 限制模型规划次数；调大增加模型成本，调小会压缩 repair 和多轮工具机会。 */
    maxPlannerCalls: 11,
    /** maxToolCalls 限制工具执行次数；调大增加数据库和 tool payload 风险，调小会影响动作补齐流程。 */
    maxToolCalls: 10,
    /** maxInvalidActions 限制非法 AgentAction 的容忍次数；调大可能掩盖 prompt/schema 问题。 */
    maxInvalidActions: 1,
    /** maxRepairAttempts 限制结构化修复次数；调大可能进入低价值 retry，调小会减少可恢复错误机会。 */
    maxRepairAttempts: 1,
    /** overallTimeoutMs 是整个 Agent run 的墙钟时间预算；调大增加请求占用，调小可能中断合法慢路径。 */
    overallTimeoutMs: 40_000,
    /** perToolTimeoutMs 是单个 tool 执行预算；调大增加慢查询占用，调小可能中断数据库读取。 */
    perToolTimeoutMs: 2_000,
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
    /** resolveExerciseResourceMentions 控制点名动作解析返回给模型的候选规模。 */
    resolveExerciseResourceMentions: {
      /** timeoutMs 限制点名解析 tool 的单次执行时间；调大可能放大慢查询影响。 */
      timeoutMs: 2_000,
      /** maxMatches 控制每个 mention 的默认候选数；调大可能增加歧义 payload，调小可能漏掉可选动作。 */
      maxMatches: 5,
    },
    /** inspectVisibleTrainingProposals 控制最近可见训练方案事实索引的读取规模。 */
    inspectVisibleTrainingProposals: {
      /** timeoutMs 限制可见训练方案事实 tool 的单次执行时间；调大可能放大事实库慢读影响。 */
      timeoutMs: 2_000,
      /** recentFactListLimit 控制 list_recent 返回的最近事实索引数量；调大增加模型上下文和引用歧义。 */
      recentFactListLimit: 3,
    },
  },
  /** trace 控制模型请求诊断文本的安全裁剪和长文本外置粒度。 */
  trace: {
    /** modelTraceMaxStringLength 限制 trace 中普通字符串预览长度；调大增加日志体积和泄漏面。 */
    modelTraceMaxStringLength: 800,
    /** modelTraceLongTextChunkLength 控制长 model input 分块大小；调大减少 chunk 数但增加单块体积。 */
    modelTraceLongTextChunkLength: 4_000,
    /** modelTracePreviewEdgeLength 控制长文本 envelope 头尾预览长度；调大提高诊断性，也增加日志体积。 */
    modelTracePreviewEdgeLength: 120,
  },
} as const satisfies AgentRuntimeConfig;
