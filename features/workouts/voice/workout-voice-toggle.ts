export type WorkoutVoiceToggleIntent = "disable" | "enable" | "unavailable";

// 训练页顶部语音按钮只表达本地偏好的两态开关，不承载恢复播报或重试语义。
export function resolveWorkoutVoiceToggleIntent({
  isPreferenceOn,
  isSupported,
}: {
  isPreferenceOn: boolean;
  isSupported: boolean;
}): WorkoutVoiceToggleIntent {
  if (!isSupported) {
    return "unavailable";
  }

  return isPreferenceOn ? "disable" : "enable";
}

// 按钮可见语义跟随两态开关：未开启时提示开启，已开启时提示关闭。
export function getWorkoutVoiceToggleLabel(input: {
  isPreferenceOn: boolean;
  isSupported: boolean;
}) {
  const intent = resolveWorkoutVoiceToggleIntent(input);

  if (intent === "unavailable") {
    return "当前浏览器不支持语音播报";
  }

  return intent === "disable" ? "关闭语音播报" : "开启语音播报";
}
