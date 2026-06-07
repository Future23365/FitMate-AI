import "server-only";

import path from "node:path";

// 默认本地动作图片目录，与下载脚本输出目录保持一致。
export const defaultExerciseImageLocalDir = "exercises_picture";
// 默认对外展示入口，由 Next.js Route 受控读取本地目录。
export const defaultExerciseImagePublicBaseUrl = "/api/exercise-images";
// 动作图片不可解析时不注入公共占位资源，交由展示层渲染空白状态。
export const defaultExerciseImageFallbackUrl = "";

// 动作图片配置描述本地文件根、对外 URL 和兜底图之间的映射关系。
export type ExerciseImageConfig = {
  localDir: string;
  publicBaseUrl: string;
  fallbackUrl: string;
  rootDir: string;
};

// 测试或局部调用可以传入配置覆盖项，运行时默认读取环境变量。
export type ExerciseImageConfigInput = Partial<ExerciseImageConfig>;

// 动作图片配置只服务服务端出站展示 URL 和受控文件读取，不改变数据库中的来源事实字段。
export function getExerciseImageConfig(input: ExerciseImageConfigInput = {}): ExerciseImageConfig {
  return {
    localDir: readConfigValue(input.localDir, process.env.EXERCISE_IMAGE_LOCAL_DIR, defaultExerciseImageLocalDir),
    publicBaseUrl: normalizePublicBaseUrl(
      readConfigValue(input.publicBaseUrl, process.env.EXERCISE_IMAGE_PUBLIC_BASE_URL, defaultExerciseImagePublicBaseUrl),
    ),
    fallbackUrl: readConfigValue(input.fallbackUrl, undefined, defaultExerciseImageFallbackUrl),
    rootDir: input.rootDir ?? process.cwd(),
  };
}

// 本地目录允许配置为绝对路径或相对项目根目录的路径，Route 会在此边界内读取文件。
export function resolveExerciseImageLocalDir(config: ExerciseImageConfig = getExerciseImageConfig()) {
  return path.resolve(config.rootDir, config.localDir);
}

// 展示 URL 拼接统一处理基础 URL 的尾斜杠和路径段编码，避免各业务服务重复处理。
export function buildExerciseImagePublicUrl(pathSegments: string[], config: ExerciseImageConfig = getExerciseImageConfig()) {
  const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");

  return `${config.publicBaseUrl}/${encodedPath}`;
}

// 基础 URL 归一化只去除尾斜杠，保留站内路径或绝对 URL 的原始语义。
export function normalizePublicBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim() || defaultExerciseImagePublicBaseUrl;

  return trimmed.replace(/\/+$/, "");
}

function readConfigValue(inputValue: string | undefined, envValue: string | undefined, fallback: string) {
  const value = inputValue ?? envValue;

  return value?.trim() || fallback;
}
