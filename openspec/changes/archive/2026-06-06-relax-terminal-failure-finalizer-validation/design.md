## Context

terminal failure finalizer 位于主 Agent run 已经失败之后，用于把内部可分类失败转换成普通用户可见回复。当前实现先用 Zod 校验输出 shape，又额外用短语列表判断 `content` 是否明确失败、是否声称成功、是否泄漏技术标识；这会让 finalizer 变成又一层语义 validator，违背兜底阶段“尽量给出内容和建议”的目的。

本次按照 `docs/llm-prompt-guidance.md` 的分层处理：主 Agent validator 继续负责结构、字段、ID、事实来源和可渲染性；finalizer 输出只作为失败后的普通聊天文本，不作为训练事实、resource 或成功 grounding 来源。因此 finalizer 输出校验只保留确定性 shape 边界。

## Goals / Non-Goals

**Goals:**

- 让 terminal failure finalizer 只要返回合法 `content` 和可选 `suggestedQuestions` 就能兜底成功。
- 移除基于用户可见中文短语的 `content` 语义白名单和黑名单判定。
- 保留 JSON shape、字段白名单、长度、建议问题数量等确定性协议边界。
- 保持无效 `visibleOutputs[]` 仍被主 Agent validator 拦截，不渲染、不保存、不写事实。
- 保留 provider/config/timeout 等不可用时的确定性 fallback。

**Non-Goals:**

- 不放宽主 Agent 的 `AgentAction`、`visibleTrainingProposal`、terminal grounding 或 resource validation。
- 不让 finalizer 输出 `visibleOutputs`、tool call、NDJSON event、artifact、训练事实或数据库写入。
- 不新增服务端关键词、正则、同义词表、用户 phrasing 或业务 `toolName` 分支。
- 不把 finalizer 文案注册成 consumable resource 或后续 grounding 来源。

## Decisions

### Decision 1: 删除 finalizer 输出的语义短语判定

实现上移除 `requiredFailureDisclosureTerms`、`forbiddenSuccessClaims`、`forbiddenTechnicalLeakTerms` 及其 user-visible text validator。`parseTerminalFailureFinalizerOutput()` 只做 Zod shape 校验，接受任何非空 `content` 和最多配置数量的非空 `suggestedQuestions`。

取舍：这会允许 finalizer 写出不够理想的失败解释，但相比“兜底模型输出了可读内容却被服务端短语白名单丢弃”，更符合 finalizer 的失败收口职责。主 Agent 的事实和结构安全不受影响。

### Decision 2: shape 校验仍保留

虽然用户要求“只需要给出建议和内容”，服务端仍需要保证 stream 可投影。因此保留：

- `content` 必填、trim 后非空、最大长度。
- `suggestedQuestions` 可选、数组、单条非空、单条最大长度、总数不超过配置。
- strict object，拒绝 `visibleOutputs`、`tool_call`、额外字段和非对象输出。

取舍：这不是语义判定，而是前端事件协议和安全投影的确定性边界。

### Decision 3: 不修改 prompt 为更强命令

finalizer prompt 仍可说明“主 Agent 未满足需求”“不得输出训练卡片”等业务边界，但不再依赖服务端短语命中来验证。这样 prompt 负责引导表达，schema 负责 shape，validator 不再通过中文短语重判模型文案。

## Risks / Trade-offs

- [Risk] finalizer 可能输出语气不够准确的失败解释。→ Mitigation：prompt 仍保留失败收口说明；trace 继续记录 finalizer 输出，后续可调整 prompt，而不是用服务端短语白名单阻断。
- [Risk] finalizer 可能提到内部技术词。→ Mitigation：输入已经脱敏，prompt 仍禁止泄漏；兜底阶段不再用脆弱字符串扫描拦截正常回复。
- [Risk] 额外字段破坏前端协议。→ Mitigation：strict schema 继续拒绝额外字段。
- [Risk] 无效训练方案被误展示。→ Mitigation：主 Agent terminal validator 和 response projection 不变，finalizer 只输出普通 `content` / `suggested_questions`。

## Migration Plan

1. 调整 finalizer 输出 parser，删除语义短语校验调用和相关常量。
2. 更新 finalizer 单元测试，确认合法 shape 即通过，额外字段和超限建议仍失败。
3. 更新 chat service 测试，确认不含固定失败短语的 finalizer 输出会成为 `terminal_failure_finalizer`，不再降级为固定 fallback。
4. 运行 OpenSpec、相关测试和 typecheck。
