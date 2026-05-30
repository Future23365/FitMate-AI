## Context

现有 `/dev/ai-traces` 已能展示聊天意图、模型请求和部分校验链路，但 Artifact、ReferenceResolver 和 PatchEngine 会引入新的决策节点。为了让第一批架构变更可验证，需要先建立基础 `AiRunTrace` 记录边界，覆盖引用、工具、Patch、校验和持久化结果。完整 Replay 和 Eval Suite 暂不实现，但 trace 数据要为后续回放保留必要快照。

## Goals / Non-Goals

**Goals:**

- 定义 AI 编排链路的基础 trace envelope 和 step 类型。
- 记录 latest user message、recent artifact summaries、模型配置、promptVersion、toolVersions 和 finalDecision。
- 记录 intent resolution、reference resolution、tool call、patch proposal、validation、persistence、response write 等关键 step。
- 让 `/dev/ai-traces` 能按阶段展示新增 step，并保留原始 JSON。
- 明确隐私和权限边界，避免 trace 泄露其他用户 payload。

**Non-Goals:**

- 不实现完整 Replay 执行器。
- 不实现 Eval Suite 自动跑批和评分。
- 不引入独立 trace 数据平台或外部观测依赖。
- 不要求模型输出完全可重放，只要求决策链路可解释。

## Decisions

### Decision 1: Trace 记录编排语义 step

trace step 使用业务阶段命名，例如 `reference_resolution`、`tool_call`、`patch_proposal`、`validation`，而不是只记录底层 HTTP 或模型请求。

这能直接回答“为什么引用到了这张卡片”“为什么 Patch 被拒绝”这类问题。

### Decision 2: 输入快照只保存必要摘要

trace input 保存 `latestUserMessage`、`recentArtifactSummaries`、用户画像和用户记忆快照摘要。完整 payload 只在经过权限校验的 tool step 中记录受控结果，避免 trace 膨胀和泄露。

后续 Replay 需要更多细节时，可以基于 runId 和 tool step 再补充版本化快照。

### Decision 3: toolVersions 与 promptVersion 必须入 trace

每次 run 记录模型、promptVersion 和 toolVersions。后续当 prompt、ReferenceResolver 或 PatchEngine 修改后，能判断同一输入为什么得到不同结果。

### Decision 4: Trace UI 兼容未知 step

`/dev/ai-traces` 对新增 step 提供可读摘要；对尚未定制解释的字段保留 Raw JSON。这样后续 step 类型扩展不会阻断调试页。

## Risks / Trade-offs

- [Risk] trace 过大影响性能。→ Mitigation: 默认记录摘要和关键输入输出，大 payload 使用截断或受控链接。
- [Risk] trace 记录敏感信息。→ Mitigation: trace 写入前执行 userId 范围约束和字段脱敏，禁止记录其他用户 artifact payload。
- [Risk] step 类型太多导致 UI 复杂。→ Mitigation: 第一版只覆盖第一批 change 需要的基础 step，后续 Eval / Replay 再扩展。
- [Risk] 失败路径 trace 缺失。→ Mitigation: 工具调用、校验和持久化失败必须记录 error step 或失败 output。
