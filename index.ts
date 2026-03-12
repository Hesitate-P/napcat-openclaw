/**
 * OpenClaw NapCat Channel 插件入口
 * 
 * 基于 NapCatQQ (OneBot v11) 的完整功能 QQ 频道插件
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { napcatChannel } from "./src/channel.js";
import { setNapcatRuntime } from "./src/runtime.js";

const plugin = {
  id: "napcat",
  name: "NapCat QQ Channel",
  description: "基于 NapCatQQ 的完整功能 QQ 频道插件，支持完整消息类型、历史存储和 Block Streaming",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setNapcatRuntime(api.runtime);
    api.registerChannel({ plugin: napcatChannel });
  },
};

export default plugin;
