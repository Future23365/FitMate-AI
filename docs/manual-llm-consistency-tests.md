# 手动 LLM 首页聊天黑盒流程测试

> 当前状态：已停用。
>
> 旧 AI/Agent 运行时、`manual-tests/llm/**`、`vitest.llm.config.ts`、`npm run test:llm` 和 `npm run test --detail` 入口已经删除。本文以下内容只作为历史黑盒验收设计记录保留，不再代表当前可运行命令或生产链路。

这组测试曾用于在修改 LLM prompt、AI 编排、模型参数或输出结构后，手动检查首页聊天真实用户流程是否仍然可用。它会调用真实模型，并复用当时的服务端聊天编排链路，因此不会包含在 `npm run test` 中。

## 历史运行方式（已删除）

以下命令对应的脚本和配置已经删除，不应在当前代码库中继续执行。

```bash
DEEPSEEK_API_KEY=你的真实 key npm run test:llm
```

历史上 `npm run test:llm` 运行基础首页聊天黑盒套件。需要运行更完整的详细套件时，曾使用：

```bash
DEEPSEEK_API_KEY=你的真实 key npm run test --detail
```

详细套件曾支持按子集运行，常用参数如下：

```bash
DEEPSEEK_API_KEY=你的真实 key npm run test --detail -- --ids F01,C03
DEEPSEEK_API_KEY=你的真实 key npm run test --detail -- --group reference
DEEPSEEK_API_KEY=你的真实 key npm run test --detail -- --suite detail-core
DEEPSEEK_API_KEY=你的真实 key npm run test --detail -- --failed-from-report docs/manual-llm-blackbox-flow-detail-latest-report.md
DEEPSEEK_API_KEY=你的真实 key npm run test --detail -- --group reference --concurrency 2
```

## suite 与 group 用例索引

`suite` 是历史运行层级，决定这条 flow 属于基础冒烟、详细核心回归还是扩展边界；`group` 是能力域标签，同一个 flow 可以同时属于多个 group。历史上 `npm run test:llm` 默认只跑 `basic`。`npm run test --detail` 会加载完整详细集合，其中包含 `basic`、`detail_core` 和 `detail_extended`；`--suite detail-core` 会归一化为源码里的 `detail_core`。

### 按 suite 查看

#### `basic`

基础冒烟流程，共 9 条，覆盖首页聊天最关键的推荐、routine、plan、上下文和引用链路。

| ID | 用例 | group | 覆盖点 |
| --- | --- | --- | --- |
| `F01` | 纯动作推荐到刷新推荐 | `recommendation`, `context` | 基础动作推荐、刷新和器械条件补充。 |
| `F02` | 动作推荐升级为单次训练 | `recommendation`, `routine`, `context` | 动作推荐升级为单次训练，并继续继承目标。 |
| `F03` | 信息不足时逐步补齐 routine | `routine`, `context` | 基础信息补齐链路，保留允许追问或生成的宽松断言。 |
| `F04` | 单次训练条件一次给齐后继续调整 | `routine`, `context` | routine 生成后的时长和难度调整。 |
| `F05` | 长期计划逐步补齐 | `plan`, `context` | 长期计划关键条件逐步补齐。 |
| `F06` | 长期计划语义区分 | `plan` | 6 天、每周 6 练和未来 6 天的长期计划语义区分。 |
| `F07` | 当前消息覆盖历史条件 | `context`, `routine` | 当前消息覆盖历史器械条件。 |
| `F13` | 非健身话题不触发训练流程 | `context`, `quality` | 天气类非健身问题后切回训练流程。 |
| `F15` | 明确引用最近卡片 | `reference`, `routine` | 最近卡片引用、升级和动作解释。 |

#### `detail_core`

详细核心回归，共 29 条，覆盖日常排查最常用的能力域。

| ID | 用例 | group | 覆盖点 |
| --- | --- | --- | --- |
| `H01` | 普通训练建议不直接出卡 | `plan`, `context` | 建议问答升级为长期计划。 |
| `H02` | 笼统寒暄不触发卡片 | `quality`, `context` | 寒暄和健身入门不误触发训练卡片。 |
| `H03` | 非健身问题边界 | `context`, `recommendation` | 股票类非健身边界；区别于 F13 的天气类轻量切回。 |
| `H04` | 无意义输入处理 | `quality`, `routine` | 无意义输入逐步收束到明确短时核心目标。 |
| `R02` | 器械条件先行 | `recommendation`, `context` | 器械条件先行并影响后续推荐。 |
| `R03` | 候选不足不编造 | `recommendation`, `quality` | 目标不清时不随机推荐。 |
| `R04` | 点名不存在动作 | `recommendation`, `quality` | 不存在动作不被编造成数据库卡片。 |
| `R05` | 多条件过滤 | `recommendation`, `context` | 部位、场地、排除动作和难度连续过滤。 |
| `R06` | 推荐解释不误刷新 | `recommendation`, `reference` | 动作解释不误刷新，后续可降低推荐难度。 |
| `W04` | 短时目标压缩 | `routine`, `context` | 多目标短时冲突先收束再生成。 |
| `W05` | 当前消息切换目标 | `routine`, `context` | 目标切换后生成腿部 routine；区别于 C03 的刷新推荐断言。 |
| `W06` | 难度降低 | `routine`, `safety` | 新手条件下高强度核心请求降级。 |
| `W08` | 训练后继续修改 | `routine`, `reference` | 局部 patch 后继续基于修改版降级；已改写输入避免与 M03 严格重复。 |
| `P03` | 计划频率修改 | `plan`, `context` | 每周 4 练增肌计划的频率和单次时长调整。 |
| `P04` | 目标变化重排计划 | `plan`, `context` | 同起点计划切换目标和训练场景；区别于 P03 的频率调整。 |
| `P06` | 日程偏好 | `plan`, `context` | 长期计划训练日偏好和局部轻量化。 |
| `C02` | 临时限制不变永久偏好 | `context`, `recommendation` | 临时不练腿不变永久偏好。 |
| `C03` | 新目标覆盖旧目标 | `context`, `recommendation` | 目标切换后刷新腿部推荐；区别于 W05 的 routine 升级。 |
| `C04` | 同轮条件覆盖 | `context`, `recommendation` | 同轮内更具体约束覆盖旧条件。 |
| `C05` | 记住时长 | `context`, `routine` | 目标切换时保留 30 分钟时长。 |
| `C06` | 条件缺口不重复追问 | `context`, `routine`, `quality` | 不重复追问已给目标和时长；已改写输入避免与 F03 严格重复。 |
| `C08` | 用户否定前一轮 | `context`, `recommendation` | 用户否定前一轮目标后按肩部继续。 |
| `M03` | 局部修改不重生成整套 | `reference`, `routine` | 标准局部替换和后续降级链路。 |
| `M06` | 解释当前卡片 | `reference`, `routine` | 解释当前 routine 后定位最后一个动作替换。 |
| `M07` | 刷新与修改区分 | `reference`, `recommendation` | 刷新推荐和局部修改语义区分。 |
| `Q01` | 无内部字段泄漏 | `quality`, `reference` | 多轮 patch 不泄漏内部字段。 |
| `Q02` | 卡片类型稳定 | `quality`, `plan`, `routine` | 动作推荐、routine、plan 卡片类型稳定升级。 |
| `Q03` | 追问可回答 | `quality`, `plan` | 追问具体可回答，条件足够后生成计划。 |
| `Q05` | 空回复和重复回复 | `quality`, `recommendation`, `routine` | 回复非空、不机械重复，并可升级核心 routine。 |

#### `detail_extended`

详细扩展和高风险边界，共 15 条，覆盖安全、质量、复杂引用和低频异常场景。

| ID | 用例 | group | 覆盖点 |
| --- | --- | --- | --- |
| `W07` | 时长边界 | `routine`, `safety` | 极短时长热身边界。 |
| `P05` | 频率过高保守处理 | `plan`, `safety` | 新手高频计划保守收束。 |
| `P07` | 长期计划解释和局部修改 | `plan`, `reference` | 解释长期计划并定位第 2 天局部降级。 |
| `C07` | 多轮非健身插入 | `context`, `reference` | 非健身插入后仍能引用最近 routine。 |
| `M02` | 引用歧义必须澄清 | `reference`, `routine` | 多个候选卡片时含糊引用必须澄清。 |
| `M04` | 重复动作确认范围 | `reference`, `routine` | 重复动作替换范围不明确时先澄清。 |
| `M05` | 修改计划某一天 | `reference`, `plan` | 长期计划第 N 天连续局部调轻；区别于 P03/P04 的整计划调整。 |
| `M08` | 确认式执行 | `plan`, `quality` | 缺时长长期计划在确认后生成。 |
| `S01` | 伤病限制 | `safety`, `routine` | 膝盖不适场景保守处理。 |
| `S02` | 医疗诊断边界 | `safety`, `quality` | 医疗诊断边界不触发训练卡片。 |
| `S03` | 高强度请求 | `safety`, `routine` | 专业健美请求在新手条件下降级。 |
| `S04` | 极端减脂 | `safety`, `plan` | 极端减脂目标收束到合理计划。 |
| `S05` | 疼痛中止 | `safety`, `recommendation` | 训练中疼痛后调整为更保守动作。 |
| `S06` | 年龄或特殊人群 | `safety`, `routine` | 老年人训练请求保守处理。 |
| `Q04` | 模型拒答异常恢复 | `quality`, `routine` | 普通健身请求不应无故拒答，异常后可恢复。 |

### 按 group 查看

- `recommendation`：动作推荐、刷新推荐、候选过滤和推荐修改语义，共 15 条：`F01` 纯动作推荐到刷新推荐；`F02` 动作推荐升级为单次训练；`H03` 非健身问题边界；`R02` 器械条件先行；`R03` 候选不足不编造；`R04` 点名不存在动作；`R05` 多条件过滤；`R06` 推荐解释不误刷新；`C02` 临时限制不变永久偏好；`C03` 新目标覆盖旧目标；`C04` 同轮条件覆盖；`C08` 用户否定前一轮；`M07` 刷新与修改区分；`S05` 疼痛中止；`Q05` 空回复和重复回复。
- `routine`：单次训练生成、升级、调整、局部替换和难度控制，共 23 条：`F02` 动作推荐升级为单次训练；`F03` 信息不足时逐步补齐 routine；`F04` 单次训练条件一次给齐后继续调整；`F07` 当前消息覆盖历史条件；`F15` 明确引用最近卡片；`H04` 无意义输入处理；`W04` 短时目标压缩；`W05` 当前消息切换目标；`W06` 难度降低；`W07` 时长边界；`W08` 训练后继续修改；`C05` 记住时长；`C06` 条件缺口不重复追问；`M02` 引用歧义必须澄清；`M03` 局部修改不重生成整套；`M04` 重复动作确认范围；`M06` 解释当前卡片；`S01` 伤病限制；`S03` 高强度请求；`S06` 年龄或特殊人群；`Q02` 卡片类型稳定；`Q04` 模型拒答异常恢复；`Q05` 空回复和重复回复。
- `plan`：长期计划生成、频率时长调整、目标切换、日程偏好和计划局部修改，共 13 条：`F05` 长期计划逐步补齐；`F06` 长期计划语义区分；`H01` 普通训练建议不直接出卡；`P03` 计划频率修改；`P04` 目标变化重排计划；`P05` 频率过高保守处理；`P06` 日程偏好；`P07` 长期计划解释和局部修改；`M05` 修改计划某一天；`M08` 确认式执行；`S04` 极端减脂；`Q02` 卡片类型稳定；`Q03` 追问可回答。
- `context`：多轮上下文继承、当前消息覆盖、非健身插入和条件记忆，共 24 条：`F01` 纯动作推荐到刷新推荐；`F02` 动作推荐升级为单次训练；`F03` 信息不足时逐步补齐 routine；`F04` 单次训练条件一次给齐后继续调整；`F05` 长期计划逐步补齐；`F07` 当前消息覆盖历史条件；`F13` 非健身话题不触发训练流程；`H01` 普通训练建议不直接出卡；`H02` 笼统寒暄不触发卡片；`H03` 非健身问题边界；`R02` 器械条件先行；`R05` 多条件过滤；`W04` 短时目标压缩；`W05` 当前消息切换目标；`P03` 计划频率修改；`P04` 目标变化重排计划；`P06` 日程偏好；`C02` 临时限制不变永久偏好；`C03` 新目标覆盖旧目标；`C04` 同轮条件覆盖；`C05` 记住时长；`C06` 条件缺口不重复追问；`C07` 多轮非健身插入；`C08` 用户否定前一轮。
- `reference`：最近卡片引用、动作解释、含糊引用澄清和 artifact payload 可读性，共 12 条：`F15` 明确引用最近卡片；`R06` 推荐解释不误刷新；`W08` 训练后继续修改；`P07` 长期计划解释和局部修改；`C07` 多轮非健身插入；`M02` 引用歧义必须澄清；`M03` 局部修改不重生成整套；`M04` 重复动作确认范围；`M05` 修改计划某一天；`M06` 解释当前卡片；`M07` 刷新与修改区分；`Q01` 无内部字段泄漏。
- `safety`：伤病、疼痛、高频高强度、特殊人群和极端目标边界，共 9 条：`W06` 难度降低；`W07` 时长边界；`P05` 频率过高保守处理；`S01` 伤病限制；`S02` 医疗诊断边界；`S03` 高强度请求；`S04` 极端减脂；`S05` 疼痛中止；`S06` 年龄或特殊人群。
- `quality`：非空回复、追问质量、卡片类型稳定、拒答恢复和内部字段泄漏控制，共 13 条：`F13` 非健身话题不触发训练流程；`H02` 笼统寒暄不触发卡片；`H04` 无意义输入处理；`R03` 候选不足不编造；`R04` 点名不存在动作；`C06` 条件缺口不重复追问；`M08` 确认式执行；`S02` 医疗诊断边界；`Q01` 无内部字段泄漏；`Q02` 卡片类型稳定；`Q03` 追问可回答；`Q04` 模型拒答异常恢复；`Q05` 空回复和重复回复。

多个筛选条件会取交集。未知 `ids`、未知 `group`、未知 `suite` 或普通筛选结果为空时，runner 会在真实模型调用前失败，并输出可用 flow id、suite 和 group。`--failed-from-report` 会从报告中提取最终状态为失败的 flow id；如果报告没有失败 flow，会生成“无需重跑”的空运行摘要，不请求真实模型。

并发只作用于 flow 级别，同一个 flow 内三轮对话始终串行执行。默认并发数为 1；只有显式传入 `--concurrency` 或 `MANUAL_LLM_CONCURRENCY` 时才会并发运行不同 flow。报告仍按 fixture 定义顺序输出，不按完成时间排序。

不带参数的 `npm run test` 仍运行原有普通 Vitest 基准测试，不会请求真实模型。

历史命令会自动读取项目根目录的 `.env*` 配置。缺少 `DEEPSEEK_API_KEY` 时，LLM 命令会明确输出缺失配置名称，生成跳过摘要，并说明不会使用 mock、旧快照或非真实模型结果。

运行开始时会输出本次测试的 token 预估，包括预计输入 token、预计输出 token、预计总量和估算来源。预估基于本次筛选后的实际运行集合计算；优先使用最近一次真实运行报告的 token 均值校准；没有可用真实报告、最近报告是跳过报告或字段缺失时，才按 fixture 数量、轮次数和保守均值 fallback。

运行结束后会输出流程用例数、轮次数、通过数、失败数、跳过数和真实 token 汇总，并生成最新验收报告：

```text
docs/manual-llm-blackbox-flow-latest-report.md
```

详细套件会生成独立报告：

```text
docs/manual-llm-blackbox-flow-detail-latest-report.md
```

报告会按流程和轮次记录用户输入、期望结果、实际用户可见回复摘要、实际卡片类型、卡片类型断言状态、语义断言状态、最终状态、失败等级、token 汇总和失败排错信息。报告还会记录完整 fixture 数、本次筛选数、筛选条件、未运行原因、并发数和 fixture 去重检查摘要。失败记录会包含 `conversationId`、`responseMessageId`、`traceId`、请求或 stream 错误摘要，以及 artifact 诊断摘要，方便判断是聊天链路错误、模型输出漂移、stream 解析失败、卡片推送缺失、会话保存失败还是引用 payload 读取失败。

## 历史 runner 与 preflight

详细套件曾使用 `api_route` runner。每轮按首页聊天字段构造 `/api/chat` 请求：

```text
conversationId
responseMessageId
latestUserMessage
conversationSummary
thinkingEnabled
```

历史 runner 会创建测试专用匿名用户并通过同一个 HttpOnly cookie 形态的 current user 调用 `/api/chat` 和会话保存 Route Handler。每个流程使用独立的 `manual-llm-*` conversationId；同一流程内后续轮次沿用保存后的会话，引用类用例通过数据库中的 `ConversationArtifact` / `ArtifactIndex` recent summary 和 payload 继续。

运行前会执行 preflight：

- 缺少 `DEEPSEEK_API_KEY`：生成跳过报告，不请求模型，不使用 mock、旧快照或非真实模型结果。
- 缺少 `DATABASE_URL`、数据库不可连、migration/schema 缺失、`ConversationArtifact` / `ArtifactIndex` 表不可用：报告为环境未满足。
- 基础动作 seed 不可用：报告为环境未满足，避免把候选缺失误判为模型回归。

## 与默认测试的边界

- `npm run test` 只运行默认 Vitest 配置，不运行真实模型黑盒流程。
- 历史手动 LLM 测试曾位于 `manual-tests/llm/`，由 `vitest.llm.config.ts` 单独收集；这些文件当前已经删除。
- 这组历史测试依赖外部模型、网络、账户额度和本地服务端依赖，结果可能因为模型波动出现偶发失败。
- 历史运行曾覆盖 `docs/manual-llm-blackbox-flow-latest-report.md`，该文件现在仅作为旧验收报告保留。

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

- 当前不再维护该 runner。后续重新接入真实模型黑盒测试时，应通过新的 OpenSpec change 重新定义测试入口、fixture、报告格式和成本控制边界。
- 每个 flow 必须声明 `suite`、至少一个 `group`、`riskLevel` 和覆盖说明；元数据缺失会被不调用真实模型的测试拒绝。
- 严格重复的三轮用户输入序列必须删除、合并或改写。确需保留高重叠 setup 时，应在重复矩阵和覆盖说明中解释差异。
- 如果只是模型措辞变化，不应把自然语言断言改成逐字匹配。
- 如果产品验收目标变化，应同步更新 `测试情况预览.md`、OpenSpec change 和本说明文档。
