# ai-token-budgeting Specification

## Purpose
TBD - created by archiving change optimize-ai-token-budgeting. Update Purpose after archive.
## Requirements
### Requirement: AI 调用必须经过 token budget 决策
系统 SHALL 在聊天与训练生成链路发起 LLM 调用前生成本轮 token budget 决策，决策结果 MUST 明确本轮需要执行的 AI 阶段、模型可见上下文、prompt module、候选动作字段和跳过原因。

#### Scenario: 生成本轮预算决策
- **WHEN** 用户向 `/api/chat` 发送新消息
- **THEN** 服务端 MUST 在执行下游 LLM 调用前生成预算决策
- **AND** 预算决策 MUST 标明意图解析、上下文总结、候选动作处理和最终回答阶段是否需要执行
- **AND** 预算决策 MUST 不依赖客户端传入的未校验字段作为事实来源

#### Scenario: 明确跳过不必要阶段
- **WHEN** 某个 AI 阶段因为用户操作、意图类型、无新增长期事实或可模板化回复而无需执行
- **THEN** 预算决策 MUST 将该阶段标记为 skipped
- **AND** 预算决策 MUST 记录稳定的中文跳过原因
- **AND** 服务端 MUST NOT 为该阶段发起 LLM 请求

### Requirement: Prompt modules 必须按任务选择
系统 SHALL 将模型指令拆分为按任务复用的 prompt modules，并且 MUST 只为本轮意图加载必要模块。

#### Scenario: 动作推荐请求
- **WHEN** 用户意图需要动作推荐
- **THEN** 模型请求 MUST 包含基础安全边界、动作推荐规则和候选动作约束
- **AND** 模型请求 MUST NOT 包含长期计划生成或训练执行的完整规则，除非本轮意图明确需要这些任务

#### Scenario: 普通健身解释请求
- **WHEN** 用户意图是普通健身解释且不需要动作库 grounding
- **THEN** 模型请求 MUST 只包含基础安全边界和普通回答规则
- **AND** 服务端 MUST NOT 构建或传入候选动作列表

#### Scenario: 澄清问题请求
- **WHEN** 服务端判断必须先向用户追问缺失信息
- **THEN** 模型请求或模板化回复 MUST 只生成与缺失字段相关的澄清问题
- **AND** 回复 MUST NOT 同时携带完整动作推荐或训练计划生成指令

### Requirement: 模型可见候选动作必须瘦身
系统 SHALL 使用候选动作模型输入白名单，确保 LLM 只接收完成当前任务所需的候选动作字段。

#### Scenario: 构造动作推荐候选列表
- **WHEN** 服务端为动作推荐构造模型可见候选动作
- **THEN** 每个候选动作 MUST 至少包含 `exerciseId`、名称、目标肌群、器械或场地、难度和匹配原因
- **AND** 每个候选动作 MUST NOT 包含完整数据库记录、内部 metadata、冗长描述或与当前意图无关的字段
- **AND** 服务端 MUST 继续保留完整动作数据用于权限、校验和持久化

#### Scenario: 控制候选动作数量
- **WHEN** 候选动作数量超过当前意图需要的上限
- **THEN** 服务端 MUST 按候选评分和领域规则裁剪为模型可见 Top N
- **AND** Trace MUST 记录裁剪前数量、裁剪后数量和裁剪原因

### Requirement: Summary 更新必须可跳过且不阻断回复
系统 SHALL 仅在本轮可能产生新的长期上下文事实时执行 summary 更新，并且 summary 更新失败 MUST NOT 阻断用户可见回复。

#### Scenario: 本轮没有新长期事实
- **WHEN** 用户消息只是确认、取消、换一批、查看详情或不改变长期训练偏好的短操作
- **THEN** 预算决策 MUST 允许跳过 LLM summary 更新
- **AND** 下一轮请求 MUST 继续使用已有 `conversationSummary`

#### Scenario: Summary 更新失败
- **WHEN** summary 更新阶段失败、超时或模型输出不可用
- **THEN** 用户可见回复 MUST 保持成功返回，除非主回复阶段本身失败
- **AND** 服务端 MUST 使用确定性兜底或保留旧 summary
- **AND** Trace MUST 记录失败原因和兜底方式

### Requirement: Token 优化不得削弱服务端质量边界
系统 SHALL 在降低 token 消耗的同时保留服务端 grounding、结构化校验、动作库约束和用户数据隔离。

#### Scenario: 推荐动作生成
- **WHEN** 模型返回动作推荐结果
- **THEN** 服务端 MUST 校验每个 `exerciseId` 来自本轮服务端候选动作
- **AND** 服务端 MUST NOT 因 token budget 裁剪而接受候选外动作

#### Scenario: 训练计划生成
- **WHEN** 模型返回训练计划或单次训练草稿
- **THEN** 服务端 MUST 继续执行既有 Zod Schema 或 JSON Schema 校验
- **AND** 服务端 MUST 继续基于 `userId`、动作候选和领域规则完成最终约束

