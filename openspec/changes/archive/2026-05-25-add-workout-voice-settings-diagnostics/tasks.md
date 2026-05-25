## 1. 语音配置链路

- [x] 1.1 扩展 `WorkoutVoiceBroadcastConfig`，支持本地 voice、语速、音量、音调和节奏音量配置。
- [x] 1.2 让 `useWorkoutVoiceBroadcast` 和 `WorkoutVoiceSession` 使用可更新配置，并确保后续播报读取用户设置。
- [x] 1.3 增加训练页本地配置读取、保存、重置和 voice 列表加载逻辑。

## 2. 全流程自检

- [x] 2.1 扩展 `runWorkoutVoiceSelfCheck`，返回可视化步骤结果并复用用户语音配置。
- [x] 2.2 覆盖 Web Speech 支持、voice 加载、语音播放事件和 Web Audio 节奏音检测。

## 3. 设置弹窗与页面清理

- [x] 3.1 在语音开关左侧新增设置按钮和训练语音设置弹窗。
- [x] 3.2 在弹窗内实现 voice 选择、参数控件、兼容版本说明和自检步骤展示。
- [x] 3.3 删除右侧训练控制区旧 `VoiceSelfCheckPanel` 常驻入口。

## 4. 验证

- [x] 4.1 运行 `openspec validate add-workout-voice-settings-diagnostics --strict`。
- [x] 4.2 运行相关 TypeScript / lint / test 检查。
- [x] 4.3 使用 Chrome DevTools MCP 打开 `http://localhost:3000/training` 验证弹窗、控制台错误和关键交互；如果本地服务不可访问，记录原因。
