## ADDED Requirements

### Requirement: Runtime 必须在结构化最终回答无效时先尝试受限 repair
系统 SHALL 在 LangChain 主 Agent 完成但未产出合法 `fitmate_final_response` 时，将该问题视为可恢复的终态结构缺失，并在进入 terminal failure finalizer 前尝试一次受限 repair。Repair MUST 基于当前模型可见消息、当前已成功工具事实、当前 tool catalog 和结构化最终回答 schema 错误进行，不得根据用户原文关键词、正则、同义词表、短句模板或具体 phrasing 改写 provider tool call、`toolName`、调用顺序或最终回答策略。

#### Scenario: 结构化最终回答缺失先进入 repair
- **WHEN** LangChain 主 Agent 返回的 `state.structuredResponse` 缺失或无法通过 `fitmate_final_response` schema 校验
- **THEN** runtime MUST 在返回 `structured_output_validation_failed` 前尝试一次结构化最终回答 repair
- **AND** repair 输入 MUST 包含脱敏的 schema 校验失败事实和当前可见上下文
- **AND** repair 输入 MUST NOT 包含服务端根据用户自然语言推断出的业务 intent
- **AND** runtime MUST NOT 直接进入 terminal failure finalizer

#### Scenario: repair 成功返回正常结果
- **WHEN** 结构化最终回答 repair 产出合法 `fitmate_final_response`
- **THEN** runtime MUST 将该结果作为正常 LangChain run 结果返回
- **AND** response adapter MUST 按正常成功路径投影 `content`、`suggested_questions` 和已通过 validator 的 `visible_output`
- **AND** runtime MUST 保留 repair 过程中发生的模型调用、provider tool call 和 tool execution trace

#### Scenario: repair 可以继续使用当前 tool catalog
- **WHEN** repair 过程中模型需要交付训练卡片、routine、plan 或其他结构化业务结果
- **THEN** 模型 MUST 只能调用当前 LangChain tool catalog 暴露的 tools
- **AND** 对应业务结构 MUST 继续通过 finalization tool、schema 和服务端 validator
- **AND** response adapter MUST NOT 渲染未通过 validator 的结构化训练结果

#### Scenario: repair 不替代澄清能力
- **WHEN** 当前事实不足以完成原始用户任务
- **THEN** repair MAY 产出合法 `fitmate_final_response.content` 追问一个关键条件
- **AND** 追问 MUST 围绕原始任务继续推进
- **AND** runtime MUST NOT 将缺少 `submitVisibleTrainingProposal` 或缺少 `visible_output` 本身视为失败，除非 repair 后仍没有合法最终回答或结构化业务结果

#### Scenario: repair 失败后才进入 terminal failure
- **WHEN** 结构化最终回答 repair 未产出合法 `fitmate_final_response`
- **THEN** runtime MAY 返回 `structured_output_validation_failed`
- **AND** `/api/chat` MAY 使用 terminal failure finalizer 或确定性 fallback 收口
- **AND** terminal failure MUST 保持为最后兜底，不得作为第一次结构化终态缺失后的直接出口

#### Scenario: repair 不写业务 toolName 语义分支
- **WHEN** runtime 构造结构化最终回答 repair 输入或处理 repair 结果
- **THEN** runtime MUST 使用通用 schema、tool catalog、tool wrapper 和 finalization 合同
- **AND** runtime MUST NOT 为 `searchExerciseResources`、`submitVisibleTrainingProposal`、`inspectVisibleTrainingProposals` 或未来业务 tool 编写语义特判
- **AND** runtime MUST NOT 根据业务字段组合决定是否自动生成 plan、routine、tool input 或用户可见正文
