import "server-only";

import type { JsonValue } from "@/lib/server/agent-core/contracts";

export type AgentVisibleOutputContractExample = {
  description: string;
  visibleOutputShape: JsonValue;
  notes: readonly string[];
};

export type AgentVisibleOutputContract = {
  outputType: string;
  schemaVersion: string;
  description: string;
  whenToUse: readonly string[];
  whenNotToUse: readonly string[];
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
        assignments: {
          field: "schedule.assignments",
          itemFields: ["cycleDayIndex", "type"],
          typeValues: ["training", "rest"],
          boundary: "schedule.assignments 只表达周期内 training/rest 日，不内嵌每天不同的完整动作编排。",
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
      description: "动作候选清单：只推荐一批 training 动作事实时使用 exercise_selection。",
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
      description: "一次训练编排：已有 warmup、training、stretch 三类可消费动作事实时使用 routine。",
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
        "schedule.assignments 只表达训练日和休息日，不内嵌每天不同的完整动作列表。",
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
    whenToUse: [...contract.whenToUse],
    whenNotToUse: [...contract.whenNotToUse],
    schemaSummary: cloneJsonValue(contract.schemaSummary),
    groundingRequirements: [...contract.groundingRequirements],
    validatorBoundary: [...contract.validatorBoundary],
    examples: contract.examples.map((example) => ({
      ...example,
      visibleOutputShape: cloneJsonValue(example.visibleOutputShape),
      notes: [...example.notes],
    })),
  };
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
