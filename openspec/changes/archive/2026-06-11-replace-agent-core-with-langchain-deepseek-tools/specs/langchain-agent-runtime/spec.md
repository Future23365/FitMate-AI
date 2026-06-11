## ADDED Requirements

### Requirement: 生产聊天必须使用 LangChain Agent Runtime
系统 SHALL 使用 LangChain agent harness 作为生产 `/api/chat` 的 Agent runtime。DeepSeek 模型调用 SHALL 使用 native Tool Calling 模式，系统 SHALL NOT 要求模型输出旧 `AgentAction` JSON 来驱动生产 tool loop。

#### Scenario: 聊天请求进入 LangChain runtime
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 完成现有请求校验、用户身份解析、conversation hydration 和 response message id 准备
- **AND** 系统 MUST 调用生产 LangChain Agent Runtime
- **AND** DeepSeek 请求 MUST 暴露 native `tools` 或等价 Tool Calling 参数
- **AND** 系统 MUST NOT 调用旧 `runAgentRuntime()`、`LlmPlanner`、旧 `DeepSeekModelAdapter` 或旧 `ReplayPlanner`

#### Scenario: DeepSeek 返回 native tool calls
- **WHEN** DeepSeek 返回一个或多个 provider `tool_calls`
- **THEN** LangChain runtime MUST 将每个 tool call 路由到已注册的 LangChain tool wrapper
- **AND** tool name MUST 来自当前生产 tool catalog
- **AND** tool arguments MUST 在执行前经过服务端 schema 校验
- **AND** 系统 MUST NOT 将 provider `tool_calls` 直接当作可信业务结果或用户可见事件

### Requirement: LangChain Tool Wrapper 必须保留服务端确定性边界
系统 SHALL 将业务能力封装为 LangChain tools。每个 tool wrapper MUST 复用项目服务端领域服务、权限隔离、Zod 校验、数据库事实校验、输出投影、trace 摘要和错误归一化。

#### Scenario: 业务 tool 执行成功
- **WHEN** LangChain runtime 调用某个业务 tool wrapper
- **THEN** wrapper MUST 使用当前服务端上下文注入 `userId`、conversation metadata、trace writer 和 abort / timeout 信号
- **AND** wrapper MUST 校验 tool arguments
- **AND** wrapper MUST 调用项目领域 service 或 repository
- **AND** wrapper MUST 返回模型可见安全摘要和内部可审计结果
- **AND** wrapper MUST NOT 暴露 secret、完整敏感 payload、跨用户数据或未经脱敏的大对象给模型

#### Scenario: 业务 tool 输入非法
- **WHEN** DeepSeek `tool_calls.arguments` 缺少必填字段、枚举非法、类型错误或引用不可访问资源
- **THEN** wrapper MUST 拒绝执行领域副作用
- **AND** wrapper MUST 返回稳定错误 code 和可恢复诊断
- **AND** LangChain runtime MAY 让模型基于该诊断继续澄清或失败收口
- **AND** 服务端 MUST NOT 用用户原文关键词改写 tool arguments

#### Scenario: 业务 tool 涉及用户私有数据
- **WHEN** tool wrapper 读取或写入 conversation、artifact、训练事实、用户记忆或其他私有数据
- **THEN** wrapper MUST 基于当前 authenticated `userId` 做权限隔离
- **AND** wrapper MUST NOT 信任客户端或模型提供的 `userId`
- **AND** wrapper MUST NOT 返回其他用户数据

### Requirement: 终态响应必须经过 Production Response Adapter
系统 SHALL 使用 production response adapter 将 LangChain run 结果投影为前端可消费的 NDJSON 白名单事件。模型和 LangChain tool MUST NOT 直接生成任意 NDJSON 事件。

#### Scenario: 普通文本回答完成
- **WHEN** LangChain agent 生成最终用户可见文本
- **THEN** response adapter MUST 输出 `content` 事件
- **AND** response adapter MUST 输出 `done` 事件
- **AND** 用户可见文本 MUST 来自受控最终消息或受控结构化终态投影
- **AND** 系统 MUST NOT 将模型原始 provider payload 直接写给前端

#### Scenario: 模型需要用户补充信息
- **WHEN** LangChain run 以澄清或需要用户输入的终态收口
- **THEN** response adapter MUST 输出用户可读的 `content`
- **AND** response adapter MAY 输出 `assistant_suggestions`
- **AND** response adapter MUST 输出 `done`
- **AND** 系统 MUST NOT 伪造旧 `ask_user` AgentAction 或旧 Agent stream event

#### Scenario: 结构化训练输出完成
- **WHEN** LangChain run 产生训练方案、动作推荐、routine、plan 或等价结构化业务输出
- **THEN** 输出 MUST 通过对应服务端 validator
- **AND** 所有 `exerciseId` MUST 经过数据库事实校验
- **AND** 未通过校验的结构化输出 MUST NOT 渲染为卡片、保存 artifact 或写入训练事实
- **AND** response adapter MUST 只渲染通过校验的用户可见结构

### Requirement: 生产 Tool Catalog 必须受控
系统 SHALL 为生产 `/api/chat` 构造明确的 LangChain tool catalog。catalog MUST 只包含当前 OpenSpec 声明、已通过测试并满足权限与投影边界的业务 tools。

#### Scenario: 构造生产 tool catalog
- **WHEN** `/api/chat` 准备 LangChain Agent Runtime
- **THEN** 系统 MUST 从服务端集中注册入口构造 production tool catalog
- **AND** catalog MUST NOT 包含 fixture tools、测试 tools、隐藏业务服务或未声明写入能力
- **AND** catalog MUST NOT 根据用户原文关键词动态增减工具

#### Scenario: 模型请求未注册工具
- **WHEN** DeepSeek 或 LangChain runtime 请求执行未注册 tool
- **THEN** 系统 MUST 拒绝执行
- **AND** trace MUST 记录未知 tool name 和拒绝 code
- **AND** 服务端 MUST NOT 通过业务分支临时执行同名或相邻能力

### Requirement: 旧自研 Agent Core 必须退出生产路径
系统 SHALL 在 LangChain runtime 完成接入后移除旧自研 Agent core 的生产依赖。生产代码 SHALL NOT 同时保留旧 core 和 LangChain runtime 两条 Agent 主链。

#### Scenario: 生产代码扫描旧 core 引用
- **WHEN** 实现完成后运行架构扫描
- **THEN** 生产 `/api/chat` MUST NOT 导入或调用 `lib/server/agent-core/**`
- **AND** 生产 `/api/chat` MUST NOT 导入或调用 `lib/server/agent-planners/**`
- **AND** 生产 `/api/chat` MUST NOT 使用旧 `AgentAction`、旧 `PlannerPort`、旧 `ToolRegistry`、旧 `Executor` 或旧 Response Renderer
- **AND** 旧 core 只能存在于迁移过程的未完成 diff 中，最终交付前 MUST 删除或移出生产代码
