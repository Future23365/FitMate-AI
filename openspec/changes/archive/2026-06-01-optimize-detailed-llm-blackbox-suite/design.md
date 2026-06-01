## Context

当前 LLM 黑盒测试已经形成两层入口：`npm run test:llm` 运行基础首页聊天黑盒套件，`npm run test --detail` 运行详细套件。基础套件 9 个三轮 flow 已用于快速验证“能回答、能推卡、会话连续”；详细套件扩展到 53 个三轮 flow，用于覆盖真实 `/api/chat`、会话保存、artifact 引用、分级断言和高价值边界。

最新详细报告暴露出两个治理问题：

- 详细 fixture 中存在严格重复三轮序列，例如 `F03` 与 `C06`、`W08` 与 `M03`。
- 多组 flow 使用相同 setup 或高度重叠路径，例如胸部切腿部、非健身后切回、每周 4 练增肌计划起点；这些重复不一定都应删除，但需要明确覆盖意图和运行层级。

详细套件的真实模型成本高，最近一次完整运行消耗超过 160 万 token。继续靠完整套件回归所有问题，会让排查速度和费用都不可控。

## Goals / Non-Goals

**Goals:**

- 删除或改写严格重复 flow，使每个详细用例有明确且不可替代的覆盖目标。
- 给详细 fixture 增加稳定分组和层级，让开发者可以按能力域、风险域或失败报告运行子集。
- 支持按 flow id 精确运行，支持从最近详细报告提取失败 flow 后重跑。
- 在显式配置下支持 flow 级并发，缩短详细套件墙钟时间，同时保持单个 flow 内的三轮上下文串行。
- 让报告输出本次运行的覆盖范围、fixture 总量、实际运行数量、过滤原因、并发配置和去重检查结果。
- 让 token 预估和跳过报告基于真实 fixture 动态统计，不再依赖脚本中的硬编码 flow/turn 数。

**Non-Goals:**

- 不改变首页聊天生产链路、AI Prompt、模型输出 schema、数据库 schema 或训练计划生成规则。
- 不把真实 LLM 测试纳入默认 `npm run test`。
- 不引入 mock、旧快照或非真实模型作为真实黑盒测试替代。
- 不在本 change 中修复详细报告里的业务失败；业务失败应由独立链路修复 change 处理。
- 不把浏览器 UI 验收、截图或 Playwright 引入 LLM 黑盒测试。

## Decisions

### 1. fixture 先治理覆盖意图，再删用例

严格重复的三轮序列必须处理，但处理方式不只等于删除。每个重复组先标注覆盖意图：

- 如果两条 flow 的三轮输入、卡片期望和语义断言都等价，保留命名更贴近覆盖目标的一条，另一条删除。
- 如果输入相同但语义断言不同，应合并到一个 flow 中，或者改写其中一条输入，使它真正覆盖不同风险。
- 如果 setup 相同但后续目标不同，可以保留，但必须通过分组和说明表达不同覆盖价值。

取舍：直接删除重复最快，但容易丢掉后来添加的语义断言。先做覆盖意图归档，可以避免把有价值的断言误删。

### 2. 用分组元数据替代命名约定筛选

详细 fixture 应为每个 flow 提供稳定元数据，例如：

- `suite`: `basic`、`detail_core`、`detail_extended`、`failure_rerun`
- `groups`: `recommendation`、`routine`、`plan`、`context`、`reference`、`safety`、`quality`
- `riskLevel`: `smoke`、`core`、`edge`

筛选逻辑应基于这些结构化字段，而不是从 `F01`、`C03`、`S06` 这类 id 前缀推断能力域。

取舍：继续使用 id 前缀成本低，但 id 前缀已经混合历史来源和能力分类，难以表达“同一个 flow 同时属于 context 和 recommendation”。结构化元数据更适合后续报告和子集运行。

### 3. 子集运行优先满足日常调试

runner 应支持以下输入：

- `--ids F03,C06`：只运行指定 flow。
- `--group reference`：运行某个能力分组。
- `--suite detail-core` 或等价配置：运行详细核心子集。
- `--failed-from-report docs/manual-llm-blackbox-flow-detail-latest-report.md`：从最近报告提取 failed flow 并重跑。

多个筛选条件应取交集或明确报错，避免无意运行过大集合。筛选结果为空时应失败并输出可用 flow id / group 摘要。

取舍：只做 `--ids` 实现最简单，但无法服务“引用类全跑一遍”“只重跑上次失败”这类常见排查路径。一次性定义筛选模型，后续加新分组成本更低。

### 4. 受控 flow 级并发，不并发单个 flow 内部轮次

单个 flow 的三轮对话必须保持串行，因为后续轮次依赖前序 conversation summary、artifact 和会话保存。不同 flow 使用独立 conversationId 与测试用户上下文，允许在显式配置 `MANUAL_LLM_CONCURRENCY` 或命令参数后并发执行。

默认并发应为 1，避免本地数据库、模型 API 限流和报告排序不稳定。并发执行后，最终报告必须按 fixture 定义顺序排序，而不是按完成时间排序。

取舍：Vitest 自带并发能力可以更快接入，但报告数组、失败跳过和 token 汇总需要稳定顺序。更稳妥的做法是 runner 自己控制 flow 队列和结果排序。

### 5. 报告要记录“跑了什么”和“为什么没跑”

详细报告除每轮结果外，应新增运行范围摘要：

- fixture 总 flow/turn 数。
- 本次筛选后的 flow/turn 数。
- 运行的 suite、groups、ids、failed-from-report 来源。
- 被筛掉的数量和原因。
- 并发配置。
- 重复检查摘要：严格重复组数量、高重叠组数量、是否阻止运行。

取舍：只在控制台输出筛选摘要更短，但报告是人工验收和后续排查入口，必须能复现当次运行范围。

### 6. 动态统计替代硬编码规模

脚本中不应硬编码详细套件 `flowCount=53`、`turnCount=159`。所有 token 预估、跳过报告、控制台摘要和报告汇总都应从实际 fixture 与筛选结果计算。

取舍：硬编码容易读，但 fixture 每次变化都要同步维护，已经成为错误来源。动态统计能让去重、分组和子集运行成为可维护能力。

## Risks / Trade-offs

- [Risk] 过度删除重复用例导致某些语义断言消失。→ Mitigation: 删除前输出重复矩阵，把被删除 flow 的独有断言迁移到保留 flow 或改写后的 flow。
- [Risk] 并发运行触发模型限流或本地数据库压力。→ Mitigation: 默认串行，并发必须显式启用；报告记录并发数，失败时能区分 stream/API 错误。
- [Risk] 过滤条件组合导致开发者以为跑了完整套件。→ Mitigation: 控制台和报告都明确显示完整 fixture 数、实际运行数和筛选条件。
- [Risk] 从报告提取失败 flow 时报告格式变更导致漏跑。→ Mitigation: 优先从报告中的稳定 `flowId` 字段或标题格式提取，提取失败时直接失败，不静默运行空集合。
- [Risk] 分组元数据维护不及时。→ Mitigation: 增加不调用真实模型的 fixture 元数据单测，校验每个 flow 至少属于一个 suite/group 且没有严格重复序列。
