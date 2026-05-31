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

运行开始时会输出本次测试的粗略 token 预估，包括预计输入 token、预计输出 token 和预计总量。预估按首页聊天多轮流程粗略计算，最终以模型返回的 `usage` 为准。

运行结束后会输出流程用例数、轮次数、通过数、失败数、跳过数和真实 token 汇总，并生成最新验收报告：

```text
docs/manual-llm-blackbox-flow-latest-report.md
```

详细套件会生成独立报告：

```text
docs/manual-llm-blackbox-flow-detail-latest-report.md
```

报告会按流程和轮次记录用户输入、期望结果、实际用户可见回复摘要、实际卡片类型、验证状态、token 汇总和失败排错信息。失败记录会包含 `conversationId`、`responseMessageId`、`traceId`、请求或 stream 错误摘要，方便判断是聊天链路错误、模型输出漂移、stream 解析失败还是卡片推送缺失。

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

## 断言策略

黑盒断言只检查用户最终可见结果：

- assistant 用户可见文本必须非空。
- 回复不得泄漏内部 trigger、JSON fenced block、raw payload 或后台流程字段。
- 预期推送卡片时，只校验 `exercise_recommendation`、`workout_routine`、`workout_plan` 类型是否出现。
- 预期追问、解释、建议问答或非健身回复时，不应推送训练卡片。
- 第一版不校验动作 ID、组数、训练时长精确值或计划细节准确性。

## 维护规则

- 新增基础黑盒流程时，优先在 `manual-tests/llm/flow-fixtures.ts` 的 `basicBlackboxFlowCases` 增加 3 轮流程用例。
- 新增详细黑盒流程时，优先在 `detailedBlackboxFlowCases` 增加 3 轮流程用例，并保持详细套件包含基础套件。
- 如果只是模型措辞变化，不应把自然语言断言改成逐字匹配。
- 如果产品验收目标变化，应同步更新 `测试情况预览.md`、OpenSpec change 和本说明文档。
