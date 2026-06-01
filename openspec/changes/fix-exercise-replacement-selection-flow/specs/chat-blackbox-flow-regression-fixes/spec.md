## ADDED Requirements

### Requirement: 黑盒回归必须覆盖动作替换候选选择流程

系统 SHALL 用贴近真实 `/api/chat` 的多轮流程覆盖动作替换候选建议、候选选择和修订卡片推送，避免只验证中间 prompt 或 trace 字段。

#### Scenario: 请求替换动作后展示候选按钮

- **WHEN** 黑盒流程已有一个包含“上斜哑铃前平举”或等价动作的 routine artifact
- **AND** 用户输入“把上斜哑铃前平举换成别的吧”
- **THEN** 用户可见回复 MUST 包含可理解的候选选择引导
- **AND** 聊天流 MUST 返回 `assistant_suggestions` 或等价统一建议事件
- **AND** 建议中 MUST 至少包含一个可直接发送的完整替换表达

#### Scenario: 选择候选后推送修订卡片

- **WHEN** 上一轮已经返回替换候选建议
- **AND** 用户点击或输入其中一个候选动作，例如“侧平举至前平举”
- **THEN** 聊天流 MUST 返回 workout patch、artifact 或等价修订卡片事件
- **AND** 用户最终可见结果 MUST 不只是普通自然语言 `answer_only`
- **AND** 修订结果 MUST 保留未被替换的训练内容

#### Scenario: 回复不得虚假承诺推卡

- **WHEN** 黑盒流程中某轮没有触发 assistant action
- **AND** 没有返回 artifact、patch 或修订卡片事件
- **THEN** 用户可见回复 MUST NOT 承诺“稍后会看到更新后的训练内容”或等价生成承诺
- **AND** 报告 MUST 将这类回复和真实事件不一致记录为失败
