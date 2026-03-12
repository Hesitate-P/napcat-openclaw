/**
 * NapCat Runtime
 * 
 * 提供运行时访问接口
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

let napcatRuntime: PluginRuntime | null = null;

export function setNapcatRuntime(runtime: PluginRuntime) {
  napcatRuntime = runtime;
}

export function getNapcatRuntime(): PluginRuntime {
  if (!napcatRuntime) {
    throw new Error("NapCat runtime not initialized");
  }
  return napcatRuntime;
}
