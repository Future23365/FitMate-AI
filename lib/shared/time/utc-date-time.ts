import { z } from "zod";

const utcDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/;
const utcDateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

// utcDateTimeStringSchema 是所有具体时间点字符串进入服务端边界的统一 UTC 契约。
export const utcDateTimeStringSchema = z.string().trim().superRefine((value, ctx) => {
  if (!utcDateTimePattern.test(value)) {
    ctx.addIssue({
      code: "custom",
      message: "Expected an ISO 8601 UTC datetime string ending with Z or +00:00.",
    });
    return;
  }

  if (!isValidUtcDateTime(value)) {
    ctx.addIssue({
      code: "custom",
      message: "Expected a valid ISO 8601 UTC datetime string.",
    });
  }
}).transform((value) => toUtcISOString(new Date(value)));

// toUtcISOString 是数据库 DateTime 离开持久化层时的唯一字符串格式化入口。
export function toUtcISOString(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Invalid Date value cannot be serialized as UTC ISO string.");
  }

  return date.toISOString();
}

// parseUtcDateTimeInput 只接受无歧义 UTC 时间点，并把 +00:00 归一化为 Z。
export function parseUtcDateTimeInput(value: string): Date {
  return new Date(utcDateTimeStringSchema.parse(value));
}

// parseUtcDateKeyToDate 将日期型业务 key 固定落到 UTC 零点，避免本地时区漂移。
export function parseUtcDateKeyToDate(dateKey: string): Date {
  if (!utcDateKeyPattern.test(dateKey)) {
    throw new Error(`Invalid UTC date key: ${dateKey}`);
  }

  const date = new Date(`${dateKey}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || toUtcDateKey(date) !== dateKey) {
    throw new Error(`Invalid UTC date key: ${dateKey}`);
  }

  return date;
}

// toUtcDateKey 从 UTC 时间点派生日历日期 key，只用于日期型展示或排期。
export function toUtcDateKey(date: Date): string {
  return toUtcISOString(date).slice(0, 10);
}

function isValidUtcDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const normalized = date.toISOString();

  return new Date(normalized).getTime() === date.getTime();
}
