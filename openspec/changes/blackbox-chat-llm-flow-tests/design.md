## Context

现有 `manual-tests/llm` 测试绕过首页聊天完整链路，直接构造 prompt 输入并分别请求 DeepSeek 的意图解析、聊天回复、动作推荐生成、训练计划意图抽取和训练草稿生成。这类测试适合验证内部 prompt 契约，但和用户真实使用路径不一致：用户只关心聊天页输入后是否看到可理解回复，以及是否出现正确类型的动作推荐、routine 或 plan 卡片。

根目录 `测试情况预览.md` 已经定义了首页聊天的黑盒验收目标和 3 轮流程。新测试应把该文档转化为可执行脚本，并保留手动 LLM 测试的真实模型、隔离运行、token 预估和报告产物。

## Goals / Non-Goals

**Goals:**

- 通过真实服务端聊天编排链路执行多轮对话，不再直接测试单个 prompt 分支。
- 以用户可见结果为断言对象：assistant 文本、是否追问、是否推送动作推荐、routine 或 plan 卡片。
- 第一版只验证流程是否能回答、是否在预期时机推送卡片，不验证动作选择、训练容量、计划准确性。
- 明确会话策略：每个流程用例默认新建会话；同一流程内第 1、2、3 轮沿用同一个 conversationId、消息历史、summary 和已生成 artifact。
- 每次运行后生成报告，包含用例验证情况、预计 token 消耗、真实 token 汇总和失败排错信息。

**Non-Goals:**

- 不启动浏览器、不使用 Playwright、不做视觉截图验收。
- 不把该测试纳入 `npm run test` 或 CI 默认路径。
- 不断言内部 `chatIntent`、`canTriggerAction`、`workoutIntent`、candidateScore 等中间字段。
- 不在第一版验证动作 ID 是否最优、训练安排是否精确匹配时长、计划分配是否专业。
- 不引入 mock 模型或录制回放替代真实模型。

## Decisions

### Decision 1: 用服务端黑盒执行器替代 prompt 分支 fixture

新增测试执行器按聊天页面请求形态组织输入：`conversationId`、`latestUserMessage`、`messages`、`conversationSummary`、`conversationContext` 和必要的 artifact 摘要。执行器调用真实 `createAiChatResponse` 或与 `/api/chat` 等价的服务端入口，消费 stream，汇总用户最终会看到的 assistant 文本、stream metadata、trigger block 和 action summary。

选择服务端执行器而不是浏览器自动化，是因为当前目标是 LLM 流程黑盒，不是 UI 渲染验收；这样能复用真实编排链路，同时避免启动 dev server 和浏览器。

### Decision 2: 断言用户可见结果，不断言中间链路

每轮断言只关心：

- assistant 文本非空，且没有泄漏内部 JSON trigger、raw payload 或后台流程字样。
- 预期推送卡片时，最终结果中存在对应 `exercise_recommendation`、`workout_routine` 或 `workout_plan` 类型。
- 预期不推送卡片时，不出现训练卡片类型。
- 预期追问时，assistant 文本是可展示的澄清问题或提供可选方向。

这比继续断言内部字段更贴近用户要求，也能降低真实模型输出轻微漂移导致的误报。

### Decision 3: 用流程用例定义会话生命周期

测试 fixture 从“调用点用例”改成“流程用例”。每个流程包含 3 个 turn，默认策略是：

- 每个流程用例开始时新建 conversationId。
- 同一流程内连续 3 轮沿用上轮的 messages、summary、conversationContext 和已生成 artifact。
- 如果第 1 轮失败，停止该流程后续轮次，并在报告中标记为首轮基础能力失败。
- 不同流程之间不共享上下文，避免 F01 的胸部推荐影响 F02 的腿部推荐。

少数专门验证跨卡片引用、刷新或歧义的用例，必须通过同一流程内前置轮次构造上下文，不依赖其他用例执行顺序。

### Decision 4: 第一版选取流程冒烟集，后续扩展覆盖完整预览

第一版优先覆盖 `测试情况预览.md` 中最能验证链路的流程：动作推荐、刷新推荐、推荐升级 routine、信息不足追问、routine 调整、长期 plan 补齐、计划语义区分、非健身切回健身、最近卡片引用。其余更细的局部替换、重复动作范围确认和计划频率修改可以在执行器稳定后扩展。

这样能先证明真实链路能跑通，并控制真实模型 token 成本。

### Decision 5: 报告记录足够排错但不倾倒大 payload

报告应写入固定 Markdown 文件，例如 `docs/manual-llm-blackbox-flow-latest-report.md`。报告包含：

- 运行时间、模型、用例数、轮次数、通过/失败/跳过数量。
- 执行前的预计 token 消耗和模型返回的真实 token 汇总。
- 每个流程、每一轮的输入、期望卡片类型、实际卡片类型、assistant 摘要和结果。
- 失败轮次的关键排错信息：conversationId、turn index、最近消息、HTTP/stream 错误、解析错误、缺失或多出的卡片类型、assistant 原文摘要、相关 trace id 或 responseMessageId。

报告不保存大段完整 prompt、完整动作候选池或完整模型 payload，避免噪声和潜在隐私风险。

## Risks / Trade-offs

- [Risk] 真实模型黑盒测试耗时和 token 成本高。→ Mitigation: 第一版使用流程冒烟集，runner 开始前输出预计 token，报告记录真实 usage。
- [Risk] 只断言用户可见结果会漏掉内部字段漂移。→ Mitigation: 这是本变更的目标取舍；内部契约可以通过普通单测或后续专门 eval 覆盖，不混进第一版黑盒流程。
- [Risk] 直接复用 `/api/chat` route 会依赖 Request/Response 和当前用户环境。→ Mitigation: 优先抽出测试友好的服务端执行器复用 `prepareAiChatRequest`、`createAiChatResponse` 和 artifact 生成逻辑；route 只保留 HTTP 适配。
- [Risk] stream 解析不稳定会造成假失败。→ Mitigation: 执行器统一解析 newline JSON stream，并把 parse error、last raw chunk 和 response status 写入失败报告。
- [Risk] 多轮状态和前端保存逻辑不一致。→ Mitigation: fixture 必须显式保存每轮 messages、summary、conversationContext、recommendation intent 和 routine/plan artifact，模拟聊天页后续请求真实会带上的上下文。
