import { readFileSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

const line = readFileSync(".env.staging", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL missing from .env.staging");

const url = line.slice("DATABASE_URL=".length).trim();
if (!new URL(url).username.includes("dgkjfmohtphrmispucwf")) {
  throw new Error("ABORT: not the staging project");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: process.env.PULL_OUT ?? "./pull-scratch",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
