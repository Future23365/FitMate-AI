## Context

`/training` 当前通过顶部音量按钮控制语音播报，并使用 `fitmate.workoutVoiceBroadcast.enabled` 写入 `localStorage`。现有实现把缺省偏好当作开启，导致首次进入训练页时可能自动播放语音和节奏提示。

本次改动只调整客户端本地偏好读取、按钮默认状态和右上角提示，不涉及训练 timeline、计时器、动作切换、AI 编排、服务端持久化或权限逻辑。

## Goals / Non-Goals

**Goals:**

- 首次进入 `/training` 且没有本地偏好时默认静音。
- 用户显式打开或关闭右上角播报按钮后，将选择持久化到 `localStorage`。
- 在右上角播报按钮附近提供带箭头的轻量提示，引导用户知道可以打开声音控制开关。
- 提示只在首次进入训练页时自动出现一次，后续进入不再弹出。
- 保持 `localStorage` 不可用时页面可用，声音状态退回当前页面内存状态。

**Non-Goals:**

- 不新增全局设置页或账户级声音偏好。
- 不改变训练准备倒计时、计时、计次和跳步逻辑。
- 不新增 AI、麦克风、服务端音频存储或外部依赖。

## Decisions

- 继续复用 `fitmate.workoutVoiceBroadcast.enabled` 作为声音开关的唯一持久化 key。原因是已有用户偏好可以无迁移复用，代码也保持单一状态源；不新增版本化 key，避免需要处理旧 key 清理和双 key 优先级。
- 新增 `fitmate.workoutVoiceBroadcast.tipSeen` 记录提示是否已经自动展示过。原因是提示生命周期不同于声音开关状态，单独持久化可以避免用户关闭声音后每次进入都被重复打扰。
- `readWorkoutVoiceBroadcastPreference()` 在缺少 key 或读取失败时返回 `false`。这让首次进入与隐私友好的默认静音一致；读取失败时仍可通过页面内 `useState` 保持当前会话可用。
- 右上角提示放在音量按钮同一容器内，并使用小箭头指向按钮，视觉上绑定到控制入口。提示不参与训练计时，不改变按钮语义；首次展示后立即标记为已看过，点击按钮或关闭提示只影响当前页面是否继续显示。

## Risks / Trade-offs

- [Risk] 已经习惯默认播报的用户首次进入新环境时不会自动听到提示。→ Mitigation: 在按钮旁直接提示“可开启声音”，并继续持久化用户主动开启后的选择。
- [Risk] 用户关闭声音后仍可能希望再次看到提示。→ Mitigation: 音量按钮始终保留明确的 `volume_off` 状态和可访问标签，提示只作为首次引导。
- [Risk] SSR 和客户端偏好加载之间存在短暂默认状态。→ Mitigation: 继续使用客户端加载完成标记控制 `useWorkoutVoiceBroadcast`，避免偏好未读取前触发播报。
