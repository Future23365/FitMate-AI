## 1. 语音会话模型

- [x] 1.1 梳理 `WorkoutSessionPage` 中现有语音相关布尔状态，定义偏好、支持、激活、播放和错误状态的类型。
- [x] 1.2 新增或重写训练语音会话控制器，统一封装 `speechSynthesis`、`SpeechSynthesisUtterance`、job id、取消和事件回调。
- [x] 1.3 保留并复用 `lib/shared/workouts/voice-cues.ts` 中的播报文案纯函数，不从 UI 文案反推语音内容。
- [x] 1.4 为语音控制器增加开发诊断输出，覆盖 speak start、end、error、cancel、stale event 和 activation retry。

## 2. 开关与刷新恢复

- [x] 2.1 将顶部语音按钮的状态从单一开启/关闭改为支持 `off`、`needs-activation`、`activating`、`active`、`speaking`、`failed`、`unsupported` 的渲染状态。
- [x] 2.2 点击开启语音时，在同一个点击事件链路内播报当前训练步骤，并根据播放事件更新 UI 状态。
- [x] 2.3 刷新页面后读取 `fitmate.workoutVoiceBroadcast.enabled=true` 时进入 `needs-activation`，并在下一次有效训练页用户手势中恢复当前步骤播报。
- [x] 2.4 关闭语音时取消当前 speech job、beep job 和等待中的激活状态，并持久化关闭偏好。

## 3. 训练流程接入

- [x] 3.1 重构动作准备阶段，使语音开启且播放成功时由动作准备提示完成事件进入“3，2，1，开始”倒计时。
- [x] 3.2 语音关闭、不可用或播放失败时走无声准备路径，确保训练不会卡在准备状态。
- [x] 3.3 跳步、上一步、下一个、暂停、结束训练和打开动作详情时统一取消或忽略旧语音 job。
- [x] 3.4 休息步骤只播报休息和下一动作提示，不触发动作准备倒计时。

## 4. Beep 与计次播报

- [x] 4.1 将计时动作 beep 绑定到已激活的页面音频会话，Web Audio 失败时不影响语音和训练计时。
- [x] 4.2 将计次动作数字播报绑定到当前步骤 job id，只播新增次数，不播放旧步骤迟到的计数。
- [x] 4.3 暂停、跳步、关闭语音、结束训练和离开页面时停止 beep 与计次播报。

## 5. 测试与验证

- [x] 5.1 补充可 mock 的语音控制器测试，覆盖点击开启成功、点击开启失败、刷新后等待激活、下一次手势恢复播报。
- [x] 5.2 补充 stale event 测试，确保旧 `onend` / `onerror` 不会推进当前准备倒计时或步骤状态。
- [x] 5.3 补充不支持 `speechSynthesis`、`localStorage` 不可用和 Web Audio 不可用的降级测试。
- [x] 5.4 运行 `npm run typecheck` 和 `npm run lint`。
- [x] 5.5 手动验证 `/training`：默认静音、点击开启有当前步骤声音、刷新后偏好开启会提示等待激活并可恢复、暂停/跳步/结束不会播放旧语音。
