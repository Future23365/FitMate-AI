# 手动 LLM 首页聊天黑盒流程测试

这组测试用于在修改 LLM prompt、AI 编排、模型参数或输出结构后，手动检查首页聊天真实用户流程是否仍然可用。它会调用真实 DeepSeek 模型，并复用服务端聊天编排链路，因此不会包含在 `npm run test` 中。

## 运行方式

```bash
DEEPSEEK_API_KEY=你的真实 key npm run test:llm
```

`npm run test:llm` 运行基础首页聊天黑盒套件。需要运行更完整的详细套件时，使用：

```bash
DEEPSEEK_API_KEY=你的真实 key npm run test --detail
```

不带参数的 `npm run test` 仍运行原有普通 Vitest 基准测试，不会请求真实模型。

命令会自动读取项目根目录的 `.env*` 配置。缺少 `DEEPSEEK_API_KEY` 时，LLM 命令会明确输出缺失配置名称，生成跳过摘要，并说明不会使用 mock、旧快照或非真实模型结果。

运行开始时会输出本次测试的 token 预估，包括预计输入 token、预计输出 token、预计总量和估算来源。优先使用最近一次真实运行报告的 token 均值校准；没有可用真实报告、最近报告是跳过报告或字段缺失时，才按 fixture 数量、轮次数和保守均值 fallback。

运行结束后会输出流程用例数、轮次数、通过数、失败数、跳过数和真实 token 汇总，并生成最新验收报告：

```text
docs/manual-llm-blackbox-flow-latest-report.md
```

详细套件会生成独立报告：

```text
docs/manual-llm-blackbox-flow-detail-latest-report.md
```

报告会按流程和轮次记录用户输入、期望结果、实际用户可见回复摘要、实际卡片类型、卡片类型断言状态、语义断言状态、最终状态、失败等级、token 汇总和失败排错信息。失败记录会包含 `conversationId`、`responseMessageId`、`traceId`、请求或 stream 错误摘要，以及 artifact 诊断摘要，方便判断是聊天链路错误、模型输出漂移、stream 解析失败、卡片推送缺失、会话保存失败还是引用 payload 读取失败。

## runner 与 preflight

详细套件使用 `api_route` runner。每轮按首页聊天字段构造 `/api/chat` 请求：

```text
conversationId
responseMessageId
latestUserMessage
conversationSummary
thinkingEnabled
```

runner 会创建测试专用匿名用户并通过同一个 HttpOnly cookie 形态的 current user 调用 `/api/chat` 和会话保存 Route Handler。每个流程使用独立的 `manual-llm-*` conversationId；同一流程内后续轮次沿用保存后的会话，引用类用例通过数据库中的 `ConversationArtifact` / `ArtifactIndex` recent summary 和 payload 继续。

运行前会执行 preflight：

- 缺少 `DEEPSEEK_API_KEY`：生成跳过报告，不请求模型，不使用 mock、旧快照或非真实模型结果。
- 缺少 `DATABASE_URL`、数据库不可连、migration/schema 缺失、`ConversationArtifact` / `ArtifactIndex` 表不可用：报告为环境未满足。
- 基础动作 seed 不可用：报告为环境未满足，避免把候选缺失误判为模型回归。

## 与默认测试的边界

- `npm run test` 仍只运行默认 Vitest 配置，不运行真实模型黑盒流程。
- 手动 LLM 测试位于 `manual-tests/llm/`，由 `vitest.llm.config.ts` 单独收集。
- 这组测试依赖外部模型、网络、账户额度和本地服务端依赖，结果可能因为模型波动出现偶发失败。
- 每次运行都会覆盖 `docs/manual-llm-blackbox-flow-latest-report.md`，该文件用于人工验收最新一次结果。

## 覆盖范围

第一版流程冒烟集覆盖以下首页聊天链路：

- 动作推荐到刷新推荐。
- 动作推荐升级为单次 routine。
- 信息不足时追问，补齐后生成 routine。
- routine 生成后调整时长和难度。
- 长期 plan 逐步补齐目标、频率、时长和器械。
- 6 天计划、每周 6 练、未来 6 天每天练的长期计划语义区分。
- 当前消息覆盖历史器械条件。
- 非健身话题不触发训练流程，切回健身后重新进入推荐和 routine。
- 明确引用最近卡片并升级为 routine。

详细套件在基础冒烟集之上继续覆盖：

- 普通建议问答和笼统寒暄不误触发卡片。
- 候选不足、不存在动作、多条件过滤和动作解释。
- 短时训练、高强度请求、目标切换和局部替换。
- 计划频率修改、日程偏好和高频训练保守处理。
- 临时限制、同轮条件覆盖、非健身插入后的上下文恢复。
- 引用歧义、医疗诊断边界、极端减脂和内部字段泄漏。
- `LLM完整测试.md` 中的高价值缺口：`P04`、`P07`、`C03`、`C05`、`C06`、`C08`、`M03`、`M04`、`M05`、`M07`、`M08`、`S03`、`S05`、`S06`、`Q04`。

以下内容仍属于人工验收或后续自动化增强，不作为当前详细套件的稳定自动断言：

- UI 输入焦点、滚动、截图和真实浏览器视觉验收。
- 动作组数、训练容量和每个动作名称的逐字精确匹配。
- 需要医疗专业判断的风险分级。
- P3 文案质量复核，例如措辞自然度、说明详略和摘要完整度。

## 断言策略

黑盒断言只检查用户最终可见结果，但现在分为卡片类型断言和语义断言两层：

- assistant 用户可见文本必须非空。
- 回复不得泄漏内部 trigger、JSON fenced block、raw payload 或后台流程字段。
- 预期推送卡片时，只校验 `exercise_recommendation`、`workout_routine`、`workout_plan` 类型是否出现。
- 预期追问、解释、建议问答或非健身回复时，不应推送训练卡片。
- 引用、动作讲解、局部修改等用例可声明 `expectedReferenceStatus` 和 `expectedArtifactPayloadReadable`，如果回复出现“没有安全读取到对应的动作详情”等引用失败语义，会按 P1 语义断言失败处理。
- 排除动作、安全边界和条件覆盖通过 `mustIncludeAny` / `mustNotIncludeAny` 做可维护关键词断言，不做整段逐字匹配。

最终状态枚举固定为：

- `passed`：卡片类型断言和语义断言都通过。
- `failed`：P0/P1/P2 自动断言失败。
- `skipped`：缺少 key、preflight 未满足或前序轮次失败导致未执行。
- `needs_review`：仅 P3 内容质量或自动断言无法稳定判断，需要人工复核，不计为通过。

## 维护规则

- 新增基础黑盒流程时，优先在 `manual-tests/llm/flow-fixtures.ts` 的 `basicBlackboxFlowCases` 增加 3 轮流程用例。
- 新增详细黑盒流程时，优先在 `detailedBlackboxFlowCases` 增加 3 轮流程用例，并保持详细套件包含基础套件。
- 如果只是模型措辞变化，不应把自然语言断言改成逐字匹配。
- 如果产品验收目标变化，应同步更新 `测试情况预览.md`、OpenSpec change 和本说明文档。
