import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const newMigrationPath = join(
  projectRoot,
  "prisma/migrations/20260531221657_standardize_database_time_format/migration.sql",
);

describe("database time format contract", () => {
  it("maps every Prisma DateTime field to timestamptz", () => {
    const schema = readFileSync(join(projectRoot, "prisma/schema.prisma"), "utf8");
    const dateTimeLines = schema
      .split("\n")
      .map((line, index) => ({ index: index + 1, line }))
      .filter(({ line }) => /\bDateTime\b/.test(line));
    const missingTimestamptz = dateTimeLines.filter(({ line }) => !line.includes("@db.Timestamptz(3)"));

    expect(missingTimestamptz).toEqual([]);
  });

  it("keeps the forward migration UTC-aware and avoids new timestamp columns", () => {
    const migration = readFileSync(newMigrationPath, "utf8");
    const sqlLines = migration
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"));

    expect(sqlLines.some((line) => /TIMESTAMP\(3\)/.test(line))).toBe(false);
    expect(migration).toContain("TIMESTAMPTZ(3)");
    expect(migration).toContain("AT TIME ZONE 'UTC'");
  });

  it("does not keep ambiguous datetime fixture literals in actively edited code", () => {
    const filesToScan = [
      "tests",
      "manual-tests",
      "lib",
      "app",
      "features",
      "scripts",
      "prisma/schema.prisma",
    ];
    const ambiguousLiteralPattern = /\d{4}-\d{2}-\d{2} [0-2]\d:[0-5]\d|new Date\("\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?![.0-9]*Z)/;
    const violations: string[] = [];

    for (const fileOrDirectory of filesToScan) {
      collectViolations(join(projectRoot, fileOrDirectory), ambiguousLiteralPattern, violations);
    }

    expect(violations).toEqual([]);
  });
});

function collectViolations(path: string, pattern: RegExp, violations: string[]) {
  const stat = statSync(path);

  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      collectViolations(join(path, entry), pattern, violations);
    }
    return;
  }

  if (!/\.(ts|tsx|js|mjs|prisma)$/.test(path)) {
    return;
  }

  const content = readFileSync(path, "utf8");

  content.split("\n").forEach((line, index) => {
    if (pattern.test(line)) {
      violations.push(`${path.replace(`${projectRoot}/`, "")}:${index + 1}:${line.trim()}`);
    }
  });
}
