## ADDED Requirements

### Requirement: 详细 LLM 黑盒 fixture 必须治理重复覆盖

系统 SHALL 让详细 LLM 黑盒 fixture 保持可解释覆盖，避免严格重复的真实模型用例长期存在。

#### Scenario: 严格重复 flow 被检测

- **WHEN** 开发者运行不调用真实模型的 LLM fixture 元数据检查
- **THEN** 系统 MUST 检测三轮用户输入完全相同的详细 flow
- **AND** 检测结果 MUST 输出重复 flow id、重复输入序列和建议处理方式
- **AND** 严格重复 flow 未被标记为允许重复时，检查 MUST 失败

#### Scenario: 重复 flow 的独有断言被保留

- **WHEN** 开发者删除、合并或改写严格重复 flow
- **THEN** 系统 MUST 保留被删除 flow 中独有的卡片类型断言、语义断言、引用断言和禁用关键词断言
- **AND** 如果独有断言无法合并到保留 flow，系统 MUST 将被删除 flow 改写为覆盖不同风险的输入序列

#### Scenario: 高重叠 flow 有明确覆盖意图

- **WHEN** 多个详细 flow 使用相同起点或相同中间输入
- **THEN** 每个保留 flow MUST 通过元数据或说明表达不同覆盖目标
- **AND** 报告 MUST 能展示这些 flow 归属的能力分组

### Requirement: 详细 LLM 黑盒测试必须支持分层与分组运行

系统 SHALL 支持按稳定 suite 层级和能力分组运行详细 LLM 黑盒测试子集，降低日常调试成本。

#### Scenario: flow 定义包含运行元数据

- **WHEN** 开发者新增或修改详细 LLM 黑盒 flow
- **THEN** 每个 flow MUST 声明所属 suite 层级
- **AND** 每个 flow MUST 声明至少一个能力分组
- **AND** 元数据检查 MUST 拒绝缺少 suite 或 group 的 flow

#### Scenario: 按能力分组运行

- **WHEN** 开发者执行手动 LLM 测试命令并指定能力分组
- **THEN** 系统 MUST 只运行属于该分组的 flow
- **AND** 控制台和报告 MUST 显示本次指定的分组、匹配 flow 数和匹配 turn 数
- **AND** 指定未知分组时命令 MUST 失败并输出可用分组列表

#### Scenario: 按 suite 层级运行

- **WHEN** 开发者执行手动 LLM 测试命令并指定详细核心、详细扩展或其他已定义 suite 层级
- **THEN** 系统 MUST 只运行该 suite 层级包含的 flow
- **AND** 系统 MUST NOT 把未指定的扩展或高风险分组混入本次运行

### Requirement: 手动 LLM runner 必须支持精确子集和失败重跑

系统 SHALL 允许开发者只运行指定 flow 或最近失败 flow，避免每次排查都运行完整详细套件。

#### Scenario: 按 flow id 运行

- **WHEN** 开发者通过命令参数指定一个或多个 flow id
- **THEN** 系统 MUST 只运行这些 flow id 对应的用例
- **AND** 指定不存在的 flow id 时命令 MUST 失败并输出未知 id
- **AND** 报告 MUST 记录本次运行的 flow id 筛选条件

#### Scenario: 从报告重跑失败 flow

- **WHEN** 开发者指定从某份 LLM 黑盒报告重跑失败用例
- **THEN** 系统 MUST 从报告中提取最终状态为 failed 的 flow id
- **AND** 系统 MUST 只运行这些失败 flow
- **AND** 如果报告中没有失败 flow，命令 MUST 明确输出无需重跑并生成空运行或跳过摘要
- **AND** 如果报告无法解析失败 flow，命令 MUST 失败，不得静默运行完整套件

#### Scenario: 筛选结果为空

- **WHEN** suite、group、flow id 或失败报告筛选后的运行集合为空
- **THEN** 系统 MUST 阻止真实模型调用
- **AND** 系统 MUST 输出筛选条件、可用 flow id、可用 suite 和可用 group 摘要

### Requirement: 详细 LLM 黑盒测试必须支持受控 flow 级并发

系统 SHALL 在显式配置下支持不同 flow 并发运行，同时保持单个 flow 内多轮上下文串行。

#### Scenario: 默认串行运行

- **WHEN** 开发者未指定 LLM 黑盒并发配置
- **THEN** 系统 MUST 以并发数 1 运行 flow
- **AND** 报告 MUST 记录并发数为 1

#### Scenario: 显式启用 flow 级并发

- **WHEN** 开发者显式指定大于 1 的 LLM 黑盒并发数
- **THEN** 系统 MAY 并发运行不同 flow
- **AND** 同一个 flow 内的三轮对话 MUST 保持串行
- **AND** 每个 flow MUST 使用独立 conversationId，避免跨 flow 共享会话状态

#### Scenario: 并发报告顺序稳定

- **WHEN** flow 级并发运行完成
- **THEN** 报告中的 flow 和 turn 结果 MUST 按 fixture 定义顺序输出
- **AND** token 汇总、失败数、跳过数和通过数 MUST 与实际执行结果一致

### Requirement: 手动 LLM 报告必须展示运行范围与动态规模

系统 SHALL 让手动 LLM 黑盒报告展示本次实际运行范围，并从 fixture 动态计算规模与成本。

#### Scenario: 报告展示筛选范围

- **WHEN** 手动 LLM 黑盒测试运行结束
- **THEN** 报告 MUST 记录完整 fixture flow/turn 数
- **AND** 报告 MUST 记录本次实际运行 flow/turn 数
- **AND** 报告 MUST 记录 suite、group、flow id、失败报告来源和并发数等运行条件

#### Scenario: 报告展示未运行原因

- **WHEN** 本次运行只覆盖完整 fixture 的子集
- **THEN** 报告 MUST 说明未运行 flow 是因为筛选条件排除、前序失败级联跳过、preflight 不满足还是缺少模型 key
- **AND** 报告 MUST NOT 把筛选排除的 flow 统计为失败

#### Scenario: token 预估动态计算

- **WHEN** runner 输出 token 预估、跳过报告或控制台摘要
- **THEN** 系统 MUST 基于当前 fixture 和筛选后的实际运行集合计算 flow 数和 turn 数
- **AND** 系统 MUST NOT 使用硬编码的基础套件或详细套件规模
- **AND** fixture 增删后报告中的流程用例数和轮次数 MUST 自动反映最新定义

#### Scenario: 去重检查结果进入报告

- **WHEN** 手动 LLM 黑盒测试运行结束
- **THEN** 报告 SHOULD 记录 fixture 去重检查摘要
- **AND** 如果存在未处理的严格重复 flow，报告 MUST 标记该运行存在 fixture 治理风险
