import type { AssistantAction } from "@/lib/server/chat/chat-service";

export type BlackboxCardType = AssistantAction["action"];

export type BlackboxFlowTurnExpectation = {
  expectedCardTypes: BlackboxCardType[];
  allowedCardTypes?: BlackboxCardType[];
  allowClarification: boolean;
  forbidTrainingCards: boolean;
  note: string;
};

export type BlackboxFlowTurn = {
  name: string;
  userInput: string;
  expectation: BlackboxFlowTurnExpectation;
};

export type BlackboxFlowCase = {
  id: string;
  name: string;
  goal: string;
  turns: [BlackboxFlowTurn, BlackboxFlowTurn, BlackboxFlowTurn];
};

const noCard = {
  expectedCardTypes: [],
  allowClarification: true,
  forbidTrainingCards: true,
} satisfies Omit<BlackboxFlowTurnExpectation, "note">;

// 首页聊天黑盒流程 fixture，只声明用户可见期望，不锁定内部 prompt 分支或训练细节。
export const blackboxFlowCases: BlackboxFlowCase[] = [
  {
    id: "F01",
    name: "纯动作推荐到刷新推荐",
    goal: "验证胸部动作推荐、换一批和无器械条件覆盖。",
    turns: [
      turn("第 1 轮：胸部动作推荐", "今天我想练胸", ["exercise_recommendation"], "应触发胸部动作推荐卡片，不生成 routine 或 plan。"),
      turn("第 2 轮：刷新推荐", "换一批", ["exercise_recommendation"], "应沿用胸部目标刷新推荐。"),
      turn("第 3 轮：加入无器械条件", "推荐几个不用器械的", ["exercise_recommendation"], "应继续推荐胸部方向，并纳入无器械条件。"),
    ],
  },
  {
    id: "F02",
    name: "动作推荐升级为单次训练",
    goal: "验证推荐动作可以沿同一会话升级为 routine，并继续调整器械条件。",
    turns: [
      turn("第 1 轮：腿部动作推荐", "推荐几个练腿动作", ["exercise_recommendation"], "应触发腿部动作推荐卡片。"),
      turn("第 2 轮：升级为 20 分钟训练", "给我做成20分钟训练", ["workout_routine"], "应继承腿部目标并触发单次 routine。"),
      turn("第 3 轮：改为无器械", "我没有器械", ["workout_routine"], "应基于同一目标调整为无器械 routine。"),
    ],
  },
  {
    id: "F03",
    name: "信息不足时逐步补齐 routine",
    goal: "验证缺少训练关键条件时先追问，补齐后再生成 routine。",
    turns: [
      {
        name: "第 1 轮：笼统要一套训练",
        userInput: "给我一套训练",
        expectation: {
          ...noCard,
          note: "信息不足时不应直接推送训练卡片。",
        },
      },
      {
        name: "第 2 轮：补齐目标和时长",
        userInput: "练胸，20分钟",
        expectation: {
          expectedCardTypes: [],
          allowedCardTypes: ["workout_routine"],
          allowClarification: true,
          forbidTrainingCards: false,
          note: "可继续追问器械/场地，也可在候选足够时生成 routine。",
        },
      },
      turn("第 3 轮：补齐器械", "没有器械", ["workout_routine"], "条件补齐后应生成胸部 20 分钟无器械 routine。"),
    ],
  },
  {
    id: "F04",
    name: "单次训练条件一次给齐后继续调整",
    goal: "验证 routine 生成后可调整时长和难度。",
    turns: [
      turn("第 1 轮：居家背部 30 分钟", "今天在家练背30分钟", ["workout_routine"], "应生成居家背部 30 分钟 routine。"),
      turn("第 2 轮：改成 45 分钟", "改成45分钟", ["workout_routine"], "应保留背部和居家条件，只调整训练量。"),
      turn("第 3 轮：降低难度", "太难了，降低一点", ["workout_routine"], "应保留 routine 目标并降低难度或强度。"),
    ],
  },
  {
    id: "F05",
    name: "长期计划逐步补齐",
    goal: "验证长期计划缺信息时追问，并在目标、频率、时长和器械补齐后生成 plan。",
    turns: [
      {
        name: "第 1 轮：笼统长期计划",
        userInput: "给我一个每周训练计划",
        expectation: {
          ...noCard,
          note: "长期计划缺关键条件时不应直接生成空泛 plan。",
        },
      },
      {
        name: "第 2 轮：补齐频率和时长",
        userInput: "每周4练，每次45分钟",
        expectation: {
          ...noCard,
          note: "应继续补齐目标或器械条件，不推送训练卡片。",
        },
      },
      turn("第 3 轮：补齐目标和器械", "增肌，有健身房器械", ["workout_plan"], "应生成每周 4 练、45 分钟、增肌、健身房 plan。"),
    ],
  },
  {
    id: "F06",
    name: "长期计划语义区分",
    goal: "验证 6 天计划、每周 6 练和未来 6 天每天练的语义切换。",
    turns: [
      turn("第 1 轮：6 天训练计划", "给我一个6天训练计划", ["workout_plan"], "应识别为长期 plan，而不是单次 routine。"),
      turn("第 2 轮：每周 6 练", "改成每周6练", ["workout_plan"], "应保持 plan 语义并切换周频率。"),
      turn("第 3 轮：未来 6 天每天练", "未来6天每天练", ["workout_plan"], "应保持 plan 语义并表达明确日历范围。"),
    ],
  },
  {
    id: "F07",
    name: "当前消息覆盖历史条件",
    goal: "验证历史器械条件会被继承，当前消息可以覆盖旧条件。",
    turns: [
      {
        name: "第 1 轮：记录器械条件",
        userInput: "我有哑铃",
        expectation: {
          ...noCard,
          note: "只记录器械条件，不应推送训练卡片。",
        },
      },
      turn("第 2 轮：继承哑铃条件", "今天练胸30分钟", ["workout_routine"], "应继承哑铃条件生成胸部 routine。"),
      turn("第 3 轮：覆盖为不用器械", "但今天不用器械", ["workout_routine"], "当前消息应覆盖历史器械条件。"),
    ],
  },
  {
    id: "F13",
    name: "非健身话题不触发训练流程",
    goal: "验证非健身问题不推卡片，切回健身后可以重新进入推荐和 routine。",
    turns: [
      {
        name: "第 1 轮：非健身问题",
        userInput: "明天天气怎么样？",
        expectation: {
          ...noCard,
          note: "非健身问题不得触发训练卡片。",
        },
      },
      turn("第 2 轮：切回胸部训练", "那我今天练胸", ["exercise_recommendation"], "应重新进入健身流程并触发胸部推荐。"),
      turn("第 3 轮：升级 routine", "做成20分钟", ["workout_routine"], "应继承胸部目标升级为 20 分钟 routine。"),
    ],
  },
  {
    id: "F15",
    name: "明确引用最近卡片",
    goal: "验证最近推荐卡片可以在同一流程内被引用并升级为 routine。",
    turns: [
      turn("第 1 轮：胸部推荐卡片", "今天想练胸", ["exercise_recommendation"], "应生成胸部推荐卡片。"),
      turn("第 2 轮：引用最近卡片升级", "把它变成20分钟训练", ["workout_routine"], "“它”应解析为最近推荐并生成 routine。"),
      {
        name: "第 3 轮：解释第一个动作",
        userInput: "第一个动作怎么做",
        expectation: {
          ...noCard,
          note: "应解释最近卡片或 routine 中的第一个动作，不重新推荐一批动作。",
        },
      },
    ],
  },
];

function turn(
  name: string,
  userInput: string,
  expectedCardTypes: BlackboxCardType[],
  note: string,
): BlackboxFlowTurn {
  return {
    name,
    userInput,
    expectation: {
      expectedCardTypes,
      allowClarification: expectedCardTypes.length === 0,
      forbidTrainingCards: expectedCardTypes.length === 0,
      note,
    },
  };
}
