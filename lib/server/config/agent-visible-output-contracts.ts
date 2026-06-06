import "server-only";

import type { JsonValue } from "@/lib/server/agent-core/contracts";

export type AgentVisibleOutputContractActionExample = {
  type: "tool_call" | "final_answer" | "ask_user";
  [field: string]: JsonValue;
};

export type AgentVisibleOutputContractExample = {
  description: string;
  userSituation?: string;
  expectedAction?: AgentVisibleOutputContractActionExample;
  expectedDecision?: string;
  visibleOutputShape?: JsonValue;
  notes: readonly string[];
};

export type AgentVisibleOutputField = {
  field: string;
  meaning: string;
};

export type AgentVisibleOutputContract = {
  outputType: string;
  schemaVersion: string;
  description: string;
  fieldDictionary: readonly AgentVisibleOutputField[];
  whenToUse: readonly string[];
  whenNotToUse: readonly string[];
  kindSelectionRules: readonly string[];
  schemaSummary: JsonValue;
  groundingRequirements: readonly string[];
  validatorBoundary: readonly string[];
  examples: readonly AgentVisibleOutputContractExample[];
};

export type AgentVisibleOutputContractSummary = {
  count: number;
  contracts: Array<{
    outputType: string;
    schemaVersion: string;
  }>;
};

/** visibleTrainingProposalOutputContract 是 Planner 可见训练结构输出合同，不承担服务端语义路由。 */
export const visibleTrainingProposalOutputContract: AgentVisibleOutputContract = {
  outputType: "visibleTrainingProposal",
  schemaVersion: "1",
  description: "用于在 final_answer.visibleOutputs[] 中交付结构化训练推荐、一次可执行训练编排或多天训练计划。",
  fieldDictionary: [
    {
      field: "visibleTrainingProposal",
      meaning: "outputType 标识，表示前端可渲染的训练结构输出能力；不是 resourceType，也不是 toolName。",
    },
    {
      field: "visible_training_proposal_fact",
      meaning: "当前 run 已导入或登记的可消费训练方案事实 resourceType；生命周期只在当前 run 和当前用户可访问边界内有效。",
    },
    {
      field: "consumable resource",
      meaning: "ResourceStore 中 role = consumable 的当前 run resource，可用于支撑成功 final_answer 或结构化输出。",
    },
    {
      field: "toolResults[].producedResources",
      meaning: "tool 执行后登记给当前 run 的 resource 引用来源；模型不能自行编造。",
    },
    {
      field: "resource summary",
      meaning: "当前 run resource 的安全压缩摘要，帮助模型理解事实边界，不是完整数据库对象。",
    },
    {
      field: "toolResults[].fulfillment.satisfied",
      meaning: "该 tool result 是否满足工具声明能力；false 表示诊断或不足，不能支撑成功训练交付。",
    },
    {
      field: "missingSectionsForRoutineOrPlan",
      meaning: "validator 或 observation 中可能出现的诊断字段，表示 routine/plan 还缺哪些 section 事实。",
    },
    {
      field: "payload",
      meaning: "visibleOutputs[] 内的业务结构对象；只能用 JSON object 表达，不写 Markdown 或自然语言列表。",
    },
    {
      field: "exerciseItems",
      meaning: "训练动作条目数组，是 visibleTrainingProposal 的唯一动作事实承载字段。",
    },
    {
      field: "schedule.assignments",
      meaning: "plan 的周期安排，只表达 cycleDayIndex 上是 training 还是 rest，不内嵌每天不同动作列表。",
    },
  ],
  whenToUse: [
    "用户目标需要结构化训练结果，并且当前 run 已有足够训练目标、限制、场地或器械等关键约束。",
    "当前 run 已存在可消费的动作事实，或已导入当前用户可访问的 consumable visible_training_proposal_fact。",
    "模型可以基于用户目标、messages、metadata、tools、observations、toolResults 和可消费 resource 自主判断输出 kind。",
  ],
  whenNotToUse: [
    "用户只需要普通健身解释、能力说明、训练原则、总结整理或不需要结构化训练结果的文本回答。",
    "当前事实只包含 failed tool result、diagnostic resource、不可消费 resource 或 satisfied=false result。",
    "缺少足以解释训练结构的目标、约束或动作事实时，不要伪造训练卡片，应继续合法 tool_call、ask_user 或失败收口。",
    "不要用 content 正文、历史 assistant 文本、示例占位值或 provider 原文作为动作、处方、编排或计划事实源。",
  ],
  kindSelectionRules: [
    "用户只需要一批可选动作候选时，选择 payload.kind = \"exercise_selection\"。",
    "用户要一次可直接照做的训练编排时，选择 payload.kind = \"routine\"。",
    "用户要多天、频次、周期或一周安排时，选择 payload.kind = \"plan\"。",
    "routine 和 plan 都必须具备 warmup、training、stretch 三类当前 run 可消费动作事实；如果缺失，不得降级输出 exercise_selection 来假装满足 routine/plan。",
    "当前 plan 只支持 one routine template + schedule：payload.exerciseItems 是一个可重复训练模板，schedule.assignments 只安排 training/rest 日。",
    "当前 plan 不支持 routines[]、schedule.assignments[].routineId 或每天不同完整动作编排；需要 A/B 训练日模板时必须等待新的 output contract schema。",
  ],
  schemaSummary: {
    envelope: {
      outputType: "visibleTrainingProposal",
      schemaVersion: "1",
      payload: "JSON object",
    },
    payload: {
      kind: {
        field: "payload.kind",
        allowedValues: ["exercise_selection", "routine", "plan"],
        boundary: "kind 是最终训练输出结构能力，不是用户短语、关键词或 toolName 映射结果。",
      },
      exerciseItems: {
        field: "payload.exerciseItems",
        itemFields: ["exerciseId", "section", "order", "prescription?"],
        sectionValues: ["warmup", "training", "stretch"],
        grounding: "exerciseId 和 section 必须由当前 run 可见动作事实或 consumable visible_training_proposal_fact 支撑；section 必须被动作事实 allowedSections 覆盖。",
      },
      prescription: {
        field: "exerciseItems[*].prescription",
        requiredForKinds: ["routine", "plan"],
        forbiddenForKinds: ["exercise_selection"],
        fields: ["mode", "sets", "target", "setRestSeconds", "transitionRestSeconds"],
        modeValues: ["reps", "duration"],
      },
      schedule: {
        field: "payload.schedule",
        requiredForKinds: ["plan"],
        forbiddenForKinds: ["exercise_selection", "routine"],
        fields: ["cycleLengthDays", "assignments"],
        planShape: "one_routine_template_with_schedule",
        assignments: {
          field: "schedule.assignments",
          itemFields: ["cycleDayIndex", "type"],
          typeValues: ["training", "rest"],
          boundary: "schedule.assignments 只表达周期内 training/rest 日；不支持 routines[]、routineId 或每天不同完整动作编排。",
        },
      },
      contentBoundary: "final_answer.content 只能解释、提醒或总结，不能作为 exerciseItems、prescription、schedule 或计划事实源。",
    },
    kindContracts: [
      {
        kind: "exercise_selection",
        requirements: [
          "只表达一批可选 training 动作事实。",
          "exerciseItems[*].section 只能是 training。",
          "不表示一次可直接照做的训练编排。",
          "不输出 prescription 或 schedule。",
        ],
      },
      {
        kind: "routine",
        requirements: [
          "表达一次可执行训练编排。",
          "必须包含 warmup、training、stretch 三类 section 的当前 run 可消费动作事实。",
          "每个 exerciseItems[*] 都必须绑定 prescription。",
          "不输出 schedule。",
        ],
      },
      {
        kind: "plan",
        requirements: [
          "表达多天或周期训练计划。",
          "当前 schema 表达 one routine template + schedule，不表达 A/B 多模板训练日。",
          "必须包含 warmup、training、stretch 三类 section 的当前 run 可消费动作事实。",
          "每个 exerciseItems[*] 都必须绑定 prescription。",
          "必须通过 schedule.assignments 表达周期内 training/rest 日。",
        ],
      },
    ],
  },
  groundingRequirements: [
    "结构化训练输出必须来自当前 run 可见事实；不要复写完整数据库对象或 handler output。",
    "exerciseItems[*].exerciseId 必须来自当前 run 可见且可消费的发布态动作事实，或当前 run 已登记的 consumable visible_training_proposal_fact。",
    "exerciseItems[*].section 必须和动作事实中的 allowedSections 相容；缺少 warmup、training 或 stretch 可消费事实时，不得伪造 routine 或 plan。",
    "failed tool result、diagnostic resource、不可消费 resource 或 satisfied=false result 只能用于恢复、澄清、repair 或 fallback，不能支撑成功 visibleTrainingProposal。",
    "ok=true 且 satisfied=true 的 0 条查询结果可以支撑普通文本解释，但不能伪装成结构化训练卡片、routine、plan 或已保存结果。",
  ],
  validatorBoundary: [
    "服务端会校验 outputType、schemaVersion、payload.kind、exerciseItems、prescription、schedule 和字段严格性。",
    "服务端会在渲染和保存前复核 exerciseId、发布态、当前用户可访问性和 allowedSections。",
    "schemaVersion 必须是字符串 \"1\"，不要输出数字 1。",
    "validator 不接受正文 content 里的动作、处方、编排或计划作为结构化事实。",
    "本合同不暴露完整 handler payload、完整数据库对象、secret、provider 原文、跨用户数据或内部 stack。",
  ],
  examples: [
    {
      description: "缺少训练约束：用户要求计划但没有足够目标、频次、时长或器械信息时先 ask_user。",
      userSituation: "用户只说想开始训练，没有提供可执行计划所需关键约束。",
      expectedAction: {
        type: "ask_user",
        content: "为了生成可执行训练计划，我还需要知道你每周想练几天、每次多久、有哪些器械。",
        suggestedQuestions: [
          "我每周练 3 天，每次 45 分钟，只能在家徒手训练",
          "我想减脂，每周练 4 天，每次 30 分钟，有哑铃",
          "我想增肌，每周练 5 天，每次 60 分钟，可以去健身房",
        ],
      },
      notes: [
        "缺关键约束时不要直接输出 visibleOutputs。",
        "ask_user 只使用 content 和 suggestedQuestions。",
      ],
    },
    {
      description: "需要动作事实：用户要结构化训练结果但当前 run 没有可消费动作事实时先 tool_call。",
      userSituation: "用户目标、频次、时长和器械明确，但当前 run 没有动作事实。",
      expectedDecision: "如果 tools 中存在能查询动作事实的已注册 tool，返回合法 tool_call；如果没有合法 tool，则 ask_user 或失败收口。",
      notes: [
        "toolName 必须来自 tools[].name，不能照抄示例占位。",
        "output contract 不规定固定 tool 调用顺序。",
      ],
    },
    {
      description: "动作候选清单：只推荐一批 training 动作事实时使用 exercise_selection。",
      userSituation: "用户只要求一批动作候选，不要求完整训练编排。",
      expectedAction: {
        type: "final_answer",
        content: "简短说明这是一批可选主训练动作。",
        suggestedQuestions: [
          "把这些动作编成一套 30 分钟训练",
          "给我一批更简单的徒手动作",
          "只保留适合在家练的动作",
        ],
        visibleOutputs: [
          {
            outputType: "visibleTrainingProposal",
            schemaVersion: "1",
            payload: {
              kind: "exercise_selection",
              exerciseItems: [
                {
                  exerciseId: "必须替换为当前 run 可见 training 动作事实中的真实 exerciseId",
                  section: "training",
                  order: 1,
                },
              ],
            },
          },
        ],
      },
      visibleOutputShape: {
        outputType: "visibleTrainingProposal",
        schemaVersion: "1",
        payload: {
          kind: "exercise_selection",
          exerciseItems: [
            {
              exerciseId: "必须替换为当前 run 可见 training 动作事实中的真实 exerciseId",
              section: "training",
              order: 1,
            },
          ],
        },
      },
      notes: [
        "示例中的 exerciseId 是占位说明，不能照抄。",
        "exercise_selection 不输出 prescription 或 schedule。",
      ],
    },
    {
      description: "事实不足的 routine：只有 training 动作事实但用户要一次完整训练时继续补齐或澄清。",
      userSituation: "当前 tool result 只提供 training 动作，用户目标需要 routine。",
      expectedDecision: "继续合法 tool_call 补齐 warmup/stretch；若无法继续获取事实，ask_user 或失败收口；不得输出缺 section 的 routine，也不得降级为 exercise_selection。",
      notes: [
        "这是 section readiness 的业务边界，不是固定 toolName 规则。",
        "missingSectionsForRoutineOrPlan 只作为诊断事实使用。",
      ],
    },
    {
      description: "一次训练编排：已有 warmup、training、stretch 三类可消费动作事实时使用 routine。",
      userSituation: "当前 run 已有三类 section 的可消费动作事实，用户要一次可执行训练。",
      expectedAction: {
        type: "final_answer",
        content: "简短说明这是一套可直接照做的训练编排。",
        visibleOutputs: [
          {
            outputType: "visibleTrainingProposal",
            schemaVersion: "1",
            payload: {
              kind: "routine",
              exerciseItems: [
                {
                  exerciseId: "必须替换为当前 run 可见 warmup 动作事实中的真实 exerciseId",
                  section: "warmup",
                  order: 1,
                  prescription: {
                    mode: "duration",
                    sets: 1,
                    target: 60,
                    setRestSeconds: 0,
                    transitionRestSeconds: 30,
                  },
                },
                {
                  exerciseId: "必须替换为当前 run 可见 training 动作事实中的真实 exerciseId",
                  section: "training",
                  order: 1,
                  prescription: {
                    mode: "reps",
                    sets: 3,
                    target: 12,
                    setRestSeconds: 60,
                    transitionRestSeconds: 45,
                  },
                },
                {
                  exerciseId: "必须替换为当前 run 可见 stretch 动作事实中的真实 exerciseId",
                  section: "stretch",
                  order: 1,
                  prescription: {
                    mode: "duration",
                    sets: 1,
                    target: 45,
                    setRestSeconds: 0,
                    transitionRestSeconds: 0,
                  },
                },
              ],
            },
          },
        ],
      },
      visibleOutputShape: {
        outputType: "visibleTrainingProposal",
        schemaVersion: "1",
        payload: {
          kind: "routine",
          exerciseItems: [
            {
              exerciseId: "必须替换为当前 run 可见 warmup 动作事实中的真实 exerciseId",
              section: "warmup",
              order: 1,
              prescription: {
                mode: "duration",
                sets: 1,
                target: 60,
                setRestSeconds: 0,
                transitionRestSeconds: 30,
              },
            },
            {
              exerciseId: "必须替换为当前 run 可见 training 动作事实中的真实 exerciseId",
              section: "training",
              order: 1,
              prescription: {
                mode: "reps",
                sets: 3,
                target: 12,
                setRestSeconds: 60,
                transitionRestSeconds: 45,
              },
            },
            {
              exerciseId: "必须替换为当前 run 可见 stretch 动作事实中的真实 exerciseId",
              section: "stretch",
              order: 1,
              prescription: {
                mode: "duration",
                sets: 1,
                target: 45,
                setRestSeconds: 0,
                transitionRestSeconds: 0,
              },
            },
          ],
        },
      },
      notes: [
        "routine 必须覆盖 warmup、training、stretch。",
        "每个动作项都必须包含 prescription。",
      ],
    },
    {
      description: "多天计划：已有三类 section 动作事实且需要周期安排时使用 plan。",
      userSituation: "当前 run 已有三类 section 的可消费动作事实，用户要一周或多天训练安排。",
      expectedAction: {
        type: "final_answer",
        content: "简短说明这是一个单训练模板重复计划。",
        visibleOutputs: [
          {
            outputType: "visibleTrainingProposal",
            schemaVersion: "1",
            payload: {
              kind: "plan",
              exerciseItems: [
                {
                  exerciseId: "必须替换为当前 run 可见 warmup 动作事实中的真实 exerciseId",
                  section: "warmup",
                  order: 1,
                  prescription: {
                    mode: "duration",
                    sets: 1,
                    target: 60,
                    setRestSeconds: 0,
                    transitionRestSeconds: 30,
                  },
                },
                {
                  exerciseId: "必须替换为当前 run 可见 training 动作事实中的真实 exerciseId",
                  section: "training",
                  order: 1,
                  prescription: {
                    mode: "reps",
                    sets: 3,
                    target: 10,
                    setRestSeconds: 75,
                    transitionRestSeconds: 45,
                  },
                },
                {
                  exerciseId: "必须替换为当前 run 可见 stretch 动作事实中的真实 exerciseId",
                  section: "stretch",
                  order: 1,
                  prescription: {
                    mode: "duration",
                    sets: 1,
                    target: 45,
                    setRestSeconds: 0,
                    transitionRestSeconds: 0,
                  },
                },
              ],
              schedule: {
                cycleLengthDays: 2,
                assignments: [
                  { cycleDayIndex: 1, type: "training" },
                  { cycleDayIndex: 2, type: "rest" },
                ],
              },
            },
          },
        ],
      },
      visibleOutputShape: {
        outputType: "visibleTrainingProposal",
        schemaVersion: "1",
        payload: {
          kind: "plan",
          exerciseItems: [
            {
              exerciseId: "必须替换为当前 run 可见 warmup 动作事实中的真实 exerciseId",
              section: "warmup",
              order: 1,
              prescription: {
                mode: "duration",
                sets: 1,
                target: 60,
                setRestSeconds: 0,
                transitionRestSeconds: 30,
              },
            },
            {
              exerciseId: "必须替换为当前 run 可见 training 动作事实中的真实 exerciseId",
              section: "training",
              order: 1,
              prescription: {
                mode: "reps",
                sets: 3,
                target: 10,
                setRestSeconds: 75,
                transitionRestSeconds: 45,
              },
            },
            {
              exerciseId: "必须替换为当前 run 可见 stretch 动作事实中的真实 exerciseId",
              section: "stretch",
              order: 1,
              prescription: {
                mode: "duration",
                sets: 1,
                target: 45,
                setRestSeconds: 0,
                transitionRestSeconds: 0,
              },
            },
          ],
          schedule: {
            cycleLengthDays: 2,
            assignments: [
              { cycleDayIndex: 1, type: "training" },
              { cycleDayIndex: 2, type: "rest" },
            ],
          },
        },
      },
      notes: [
        "plan 必须覆盖 warmup、training、stretch。",
        "当前 plan = one routine template + schedule。",
        "schedule.assignments 只表达训练日和休息日，不内嵌每天不同的完整动作列表。",
      ],
    },
    {
      description: "基于已有结构派生计划：用户要求按当前内容做一周计划时使用 derive。",
      userSituation: "当前 run 可见对象已经可消费，用户要求基于这个结果派生周期安排。",
      expectedDecision: "如果事实满足 plan schema，返回 final_answer + plan visibleOutputs；如果事实不足，继续合法 tool_call 或 ask_user。",
      notes: [
        "derive 只是内部推理标签，不能出现在 AgentAction JSON。",
        "引用对象不可见时不能假装已基于它生成。",
      ],
    },
    {
      description: "替换或修改：用户要求换一批、避免重复或组数少一点时使用 replace / modify。",
      userSituation: "当前 run 可见对象可操作，用户要求替换动作或调整处方。",
      expectedDecision: "根据当前可见事实和 tools 自主选择合法 tool_call 或 final_answer + visibleOutputs；引用不可见时 ask_user 或说明上下文不足。",
      notes: [
        "replace / modify 是内部推理标签，不能写入 AgentAction JSON。",
        "不能根据固定短语硬编码 toolName 或 payload.kind。",
      ],
    },
  ],
};

/** agentVisibleOutputContractRegistry 是生产 Planner 当前可见的结构化用户输出能力清单。 */
export const agentVisibleOutputContractRegistry = [
  visibleTrainingProposalOutputContract,
] as const;

/** getAgentVisibleOutputContracts 返回安全克隆，避免调用方修改集中 registry。 */
export function getAgentVisibleOutputContracts(): AgentVisibleOutputContract[] {
  return agentVisibleOutputContractRegistry.map(cloneOutputContract);
}

/** summarizeAgentVisibleOutputContracts 只暴露 trace 可审计摘要，不记录完整合同 payload。 */
export function summarizeAgentVisibleOutputContracts(
  contracts: readonly AgentVisibleOutputContract[] = agentVisibleOutputContractRegistry,
): AgentVisibleOutputContractSummary {
  return {
    count: contracts.length,
    contracts: contracts.map((contract) => ({
      outputType: contract.outputType,
      schemaVersion: contract.schemaVersion,
    })),
  };
}

function cloneOutputContract(contract: AgentVisibleOutputContract): AgentVisibleOutputContract {
  return {
    ...contract,
    fieldDictionary: contract.fieldDictionary.map((field) => ({ ...field })),
    whenToUse: [...contract.whenToUse],
    whenNotToUse: [...contract.whenNotToUse],
    kindSelectionRules: [...contract.kindSelectionRules],
    schemaSummary: cloneJsonValue(contract.schemaSummary),
    groundingRequirements: [...contract.groundingRequirements],
    validatorBoundary: [...contract.validatorBoundary],
    examples: contract.examples.map((example) => ({
      ...example,
      ...(example.expectedAction === undefined ? {} : { expectedAction: cloneJsonValue(example.expectedAction) }),
      ...(example.visibleOutputShape === undefined ? {} : { visibleOutputShape: cloneJsonValue(example.visibleOutputShape) }),
      notes: [...example.notes],
    })),
  };
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
