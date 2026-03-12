/**
 * 通用消息解析工具
 * 
 * 供 channel.ts 和 napcat-tools skill 共用的消息解析函数
 */

// 简单的表情 ID 到名称的映射
function getFaceName(faceId: string): string {
  const faceMap: Record<string, string> = {
    '0': '微笑', '1': '撇嘴', '2': '色', '3': '发呆', '4': '得意',
    '5': '流泪', '6': '害羞', '7': '闭嘴', '8': '睡', '9': '大哭',
    '10': '尴尬', '11': '发怒', '12': '调皮', '13': '呲牙', '14': '惊讶',
    '15': '难过', '16': '酷', '17': '冷汗', '18': '抓狂', '19': '吐',
    '20': '偷笑', '21': '愉快', '22': '白眼', '23': '傲慢', '24': '饥饿',
    '25': '困', '26': '惊恐', '27': '流汗', '28': '憨笑', '29': '悠闲',
    '30': '奋斗', '31': '咒骂', '32': '疑问', '33': '嘘', '34': '晕',
    '35': '疯了', '36': '衰', '37': '骷髅', '38': '敲打', '39': '再见',
    '40': '擦汗', '41': '抠鼻', '42': '鼓掌', '43': '糗大了', '44': '坏笑',
    '45': '左哼哼', '46': '右哼哼', '47': '哈欠', '48': '鄙视', '49': '委屈',
    '50': '快哭了', '51': '阴险', '52': '亲亲', '53': '吓', '54': '可怜',
    '55': '菜刀', '56': '西瓜', '57': '啤酒', '58': '篮球', '59': '乒乓',
    '60': '咖啡', '61': '饭', '62': '猪头', '63': '玫瑰', '64': '凋谢',
    '65': '唇', '66': '爱心', '67': '心碎', '68': '蛋糕', '69': '闪电',
    '70': '炸弹', '71': '刀', '72': '足球', '73': '瓢虫', '74': '便便',
    '75': '月亮', '76': '太阳', '77': '礼物', '78': '拥抱', '79': '强',
    '80': '弱', '81': '握手', '82': '胜利', '83': '抱拳', '84': '勾引',
    '85': '拳头', '86': '差劲', '87': '爱你', '88': 'NO', '89': 'OK',
    '90': '爱情', '91': '飞吻', '92': '跳跳', '93': '发抖', '94': '怄火',
    '95': '转圈', '96': '磕头', '97': '回头', '98': '跳绳', '99': '挥手',
    '100': '激动', '101': '街舞', '102': '献吻', '103': '左太极', '104': '右太极',
  };
  return faceMap[faceId] || `表情${faceId}`;
}

/**
 * 解析消息元素为文本
 * 
 * @param elements 消息元素数组
 * @param client NapCat 客户端（可选，用于获取@用户昵称）
 * @param groupId 群 ID（可选）
 * @param cfg 配置对象（可选，用于兼容旧接口）
 */
export async function resolveMessageText(
  elements: any[],
  client?: any,
  groupId?: number,
  _cfg?: any  // 兼容旧接口，未使用
): Promise<string> {
  if (!Array.isArray(elements)) {
    return "";
  }
  
  let resolvedText = "";
  
  for (const seg of elements) {
    if (seg.type === "text") {
      resolvedText += seg.data?.text || "";
    }
    else if (seg.type === "at") {
      let qqId = seg.data?.qq ?? seg.data?.user_id;
      let name = qqId;
      
      if (name === "all" || name === "everyone") {
        resolvedText += " @全体成员 ";
      } else if (groupId && client && qqId) {
        try {
          const info = await client.sendAction("get_group_member_info", {
            group_id: groupId,
            user_id: Number(qqId),
          });
          name = info?.card || info?.nickname || String(qqId);
        } catch (e) {
          name = String(qqId);
        }
        resolvedText += ` @${name} `;
      } else {
        resolvedText += ` @${name} `;
      }
    }
    else if (seg.type === "face") {
      const faceId = String(seg.data?.id ?? seg.data?.face_id ?? "0");
      const faceName = getFaceName(faceId);
      const result = seg.data?.result;
      const chainCount = seg.data?.chainCount;
      
      if (result !== undefined) {
        resolvedText += ` [表情：${faceName}, 结果：${result}] `;
      } else if (chainCount) {
        resolvedText += ` [表情：${faceName}, 连续：${chainCount}个] `;
      } else {
        resolvedText += ` [表情：${faceName}] `;
      }
    }
    else if (seg.type === "image") {
      const url = seg.data?.url || seg.data?.file;
      const summary = seg.data?.summary;
      if (summary) {
        resolvedText += ` [图片：${summary}] `;
      } else if (url && (url.startsWith("http") || url.startsWith("base64://"))) {
        resolvedText += ` [图片：${url}] `;
      } else {
        resolvedText += ` [图片] `;
      }
    }
    else if (seg.type === "file") {
      const name = seg.data?.name || "unknown";
      const fileId = seg.data?.file_id || seg.file_id || "unknown";
      resolvedText += `[文件：${name}, ID:${fileId}]`;
    }
    else if (seg.type === "record") {
      resolvedText += " [语音] ";
    }
    else if (seg.type === "video") {
      resolvedText += " [视频] ";
    }
    else if (seg.type === "mface") {
      const summary = seg.data?.summary;
      const emojiId = seg.data?.emoji_id;
      resolvedText += ` [商城表情：${summary || `ID:${emojiId}`}] `;
    }
    else if (seg.type === "forward") {
      resolvedText += " [转发消息] ";
    }
    else if (seg.type === "xml" || seg.type === "json") {
      resolvedText += " [卡片消息] ";
    }
    else if (seg.type === "poke") {
      resolvedText += " [戳一戳] ";
    }
    else {
      // 未知类型，跳过
    }
  }
  
  return resolvedText.trim();
}
