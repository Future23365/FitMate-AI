## ADDED Requirements

### Requirement: 默认 prompt 必须区分通用训练知识和产品动作资源库
系统 SHALL 在默认 LangChain Agent system prompt 中表达：模型可以基于用户输入、当前上下文、成功 tool result 和通用训练知识回答普通文本训练建议；Exercise 动作库只提供产品可渲染动作资源和结构化训练输出所需的受控数据库动作事实。默认 prompt MUST NOT 将动作库查询空结果表达为现实训练动作或训练知识不存在。

#### Scenario: 普通文本回答不以动作库为知识全集
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达不需要动作卡片、动作图片、结构化训练结果或训练执行项时，模型可以通过 `fitmate_final_response.content` 给出普通文本建议
- **AND** system message MUST 表达普通文本建议不得声称未经数据库支撑的动作来自产品动作库
- **AND** system message MUST 表达动作库没有匹配资源不等于现实训练知识不存在

#### Scenario: 结构化训练输出仍依赖数据库动作事实
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达需要展示具体数据库动作条目、动作卡片、动作图片、`visibleTrainingProposal`、routine、plan 或训练执行项时，具体 `exerciseId` 必须来自当前模型可见数据库动作事实或受控业务事实
- **AND** system message MUST 表达服务端会校验这些结构化输出中的数据库动作事实
- **AND** system message MUST NOT 允许模型为结构化训练输出编造数据库动作条目

#### Scenario: 不新增服务端语义分流
- **WHEN** 实现本 prompt change
- **THEN** `/api/chat`、LangChain runtime、tool handler、validator 和 response adapter MUST NOT 新增基于用户原文、关键词、正则、同义词表或短句模板的条件分支
- **AND** 系统 MUST NOT 根据某个自然语言动作名自动改写 provider `tool_calls`、`toolName`、调用顺序或最终回答策略
