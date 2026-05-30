## ADDED Requirements

### Requirement: Training completion voice cue
系统 SHALL 在训练完成时通过现有训练语音 scheduler 播放一次完成提示，并确保完成提示不被旧步骤语音、倒计时、计次或 beep 任务覆盖。

#### Scenario: Training finishes with voice enabled and activated
- **WHEN** 用户在 `/training` 完成本次训练，并且语音播报偏好已开启且页面语音会话已经激活
- **THEN** 系统 MUST 取消当前步骤、倒计时、计次和 beep 相关的待播任务
- **AND** 系统 MUST 播报“本次训练已完成”
- **AND** 系统 MUST 保持训练完成视觉状态和结果保存流程继续执行

#### Scenario: Training finishes when voice cannot play
- **WHEN** 用户完成训练但语音播报关闭、浏览器不支持语音、页面语音尚未激活或完成提示播放失败
- **THEN** 系统 MUST 继续进入训练完成态
- **AND** 系统 MUST 继续异步保存训练结果
- **AND** 系统 MUST NOT 因完成提示不可播放而回退训练步骤或阻塞页面操作

#### Scenario: Completion cue is not stale step feedback
- **WHEN** 训练完成提示被调度
- **THEN** 系统 MUST 将完成提示视为当前训练会话级别的语音任务
- **AND** 已取消或已过期的旧步骤语音回调 MUST NOT 更新当前完成态、准备状态或 active step 状态
