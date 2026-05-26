## ADDED Requirements

### Requirement: Single source workout execution state
系统 SHALL 在 `/training` 使用页面训练执行状态机作为动作计时、休息计时、准备倒计时、暂停继续、跳步和完成态的唯一事实源。语音播报状态、Web Speech 事件和语音 scheduler 内部状态 MUST NOT 作为动作步骤是否可以开始计时的唯一依据。

#### Scenario: Exercise preparation starts
- **WHEN** 用户点击“开始”并且当前时间线步骤是 `exercise`
- **THEN** 系统 MUST 将当前步骤进入明确的动作准备状态
- **AND** 系统 MUST 记录该准备状态归属的当前步骤 key
- **AND** 系统 MUST NOT 仅依靠语音 hook 内部派生值判断当前动作是否准备中

#### Scenario: Preparation countdown completes
- **WHEN** 当前动作的准备倒计时归零
- **THEN** 系统 MUST 将当前步骤进入可计时的动作运行状态
- **AND** 当前动作倒计时或计次推进 MUST 开始运行
- **AND** 系统 MUST NOT 继续被语音准备 cue、语音倒计时 cue 或旧准备 key 阻塞

#### Scenario: Voice callback does not arrive
- **WHEN** 当前动作提示语音的完成回调没有返回、返回过晚、被取消或被浏览器阻止
- **THEN** 系统 MUST 通过页面侧兜底路径继续推进准备流程
- **AND** 当前动作 MUST NOT 无限停留在动作准备状态

#### Scenario: User pauses and resumes during exercise
- **WHEN** 当前动作已经进入运行状态且用户点击“暂停”后再点击“继续”
- **THEN** 系统 MUST 从暂停前的动作运行状态继续计时或计次
- **AND** 系统 MUST NOT 因暂停期间语音 cue 被取消而重新进入动作准备状态

#### Scenario: User pauses during preparation countdown
- **WHEN** 当前动作处于准备倒计时阶段且用户点击“暂停”
- **THEN** 准备倒计时 MUST 停止推进
- **AND** 用户点击“继续”后准备倒计时 MUST 从暂停前数值继续
- **AND** 系统 MUST NOT 重新播放旧动作提示后覆盖当前准备状态

#### Scenario: User changes step while stale callbacks exist
- **WHEN** 用户跳到上一步、下一步、跳过休息或从训练项目列表选择动作
- **THEN** 系统 MUST 为新步骤创建新的执行状态归属
- **AND** 旧步骤后续到达的准备倒计时、语音完成、计时或计次回调 MUST NOT 更新当前步骤状态

### Requirement: Workout session flow analysis before implementation
系统 SHALL 在实现训练准备流程修复前补充整体流程分析文档，明确 `/training` 的数据流、状态流、异步回调边界和验证矩阵。

#### Scenario: Flow analysis is created
- **WHEN** 开始实现本 change 的代码修复前
- **THEN** 系统 MUST 在当前 change 文档目录中补充整体流程分析文档
- **AND** 文档 MUST 覆盖 schedule 加载、timeline 构建、训练开始、动作准备、准备倒计时、动作运行、休息、暂停继续、跳步、完成提交和错误降级路径

#### Scenario: Flow analysis identifies state owners
- **WHEN** 整体流程分析文档描述训练执行状态
- **THEN** 文档 MUST 明确每个状态由页面层、语音 hook、语音 session 或服务端中的哪一层拥有
- **AND** 文档 MUST 明确语音层不得拥有动作计时是否放行的状态事实

#### Scenario: Flow analysis defines verification matrix
- **WHEN** 整体流程分析文档描述验证方式
- **THEN** 文档 MUST 列出自动化测试覆盖项
- **AND** 文档 MUST 列出需要人工或浏览器验证的语音/Web Speech 路径
- **AND** 文档 MUST 标明真实浏览器验证需要用户明确允许后再执行
