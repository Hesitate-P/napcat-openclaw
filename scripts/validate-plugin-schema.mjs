import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { NapCatConfigSchema } from "../src/config.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginJsonPath = path.join(repoRoot, "openclaw.plugin.json");

function unwrapSchema(schema) {
  let current = schema;
  while (current?._def?.innerType || current?.def?.innerType) {
    current = current._def?.innerType ?? current.def?.innerType;
  }
  return current;
}

function getShape(schema) {
  const target = unwrapSchema(schema);
  if (!target) return undefined;
  if (typeof target.shape === "function") return target.shape;
  if (target.shape) return target.shape;
  if (typeof target._def?.shape === "function") return target._def.shape();
  if (typeof target.def?.shape === "function") return target.def.shape();
  return undefined;
}

function buildPropertyTree(schema) {
  const shape = getShape(schema);
  if (!shape) return {};

  const entries = Object.entries(shape);
  return Object.fromEntries(entries.map(([key, value]) => {
    const childShape = getShape(value);
    return [key, childShape ? buildPropertyTree(value) : true];
  }));
}

function buildPluginTree(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      const nested = value?.properties;
      return [key, nested ? buildPluginTree(nested) : true];
    }),
  );
}

function collectDiffs(expected, actual, prefix = "") {
  const diffs = [];
  const keys = new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})]);

  for (const key of [...keys].sort()) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (!(key in (expected || {}))) {
      diffs.push(`plugin.json 多出字段: ${label}`);
      continue;
    }
    if (!(key in (actual || {}))) {
      diffs.push(`plugin.json 缺少字段: ${label}`);
      continue;
    }

    const expectedChild = expected[key];
    const actualChild = actual[key];
    if (expectedChild !== true || actualChild !== true) {
      diffs.push(...collectDiffs(expectedChild === true ? {} : expectedChild, actualChild === true ? {} : actualChild, label));
    }
  }

  return diffs;
}

const pluginJson = JSON.parse(await readFile(pluginJsonPath, "utf8"));
const schemaTree = buildPropertyTree(NapCatConfigSchema);
const pluginTree = buildPluginTree(pluginJson.configSchema?.properties);
const diffs = collectDiffs(schemaTree, pluginTree);

if (diffs.length > 0) {
  console.error("NapCat schema 校验失败:");
  for (const diff of diffs) {
    console.error(`- ${diff}`);
  }
  process.exit(1);
}

console.log("NapCat schema 校验通过");
