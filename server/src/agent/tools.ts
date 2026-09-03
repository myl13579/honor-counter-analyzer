import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { KNOWLEDGE_DIR } from '../config.js';
import { getAllCounters, getCounter, resolveHero } from '../knowledge.js';
import { BingProvider } from './searchProvider.js';

const searchProvider = new BingProvider();

/** 读取知识库文件（文件名白名单，防路径穿越） */
const KNOWN_FILES = new Set(['counters.md', 'heroes.json', 'items.json', 'summoners.json', 'playstyle.md']);

export const readKnowledgeTool = tool(
  async ({ file }) => {
    const safe = path.basename(file);
    if (!KNOWN_FILES.has(safe)) return `未知文件: ${safe}，可用文件：${[...KNOWN_FILES].join('、')}`;
    const filePath = path.join(KNOWLEDGE_DIR, safe);
    if (!fs.existsSync(filePath)) return `文件不存在: ${safe}`;
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.length > 8000 ? content.slice(0, 8000) + '\n...(内容过长已截断，请用 grep_knowledge 精确检索)' : content;
  },
  {
    name: 'read_knowledge',
    description: '读取本地知识库文件内容。文件清单：counters.md(克制关系)、heroes.json(英雄名单)、items.json(装备)、summoners.json(召唤师技能)、playstyle.md(打法思路与对线策略)',
    schema: z.object({ file: z.string().describe('知识库文件名，如 counters.md') }),
  }
);

export const grepKnowledgeTool = tool(
  async ({ keyword }) => {
    // 1. 优先精确/模糊匹配英雄名，返回克制关系条目
    const resolved = resolveHero(keyword);
    if (resolved) {
      const entry = getCounter(resolved.name);
      if (entry) return JSON.stringify(entry, null, 2);
    }
    // 2. 全文搜索 counters.md
    const counters = getAllCounters();
    const byName = counters.filter((c) => c.name.includes(keyword));
    if (byName.length) return JSON.stringify(byName, null, 2);
    const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'counters.md'), 'utf-8');
    const hits = content.split('\n').filter((l) => l.includes(keyword)).slice(0, 20);
    return hits.length ? hits.join('\n') : `未在知识库中找到「${keyword}」相关条目，可尝试 web_search 联网检索`;
  },
  {
    name: 'grep_knowledge',
    description: '在知识库中搜索英雄名或关键词，返回克制关系/相关条目（支持错别字容错）',
    schema: z.object({ keyword: z.string().describe('英雄名或关键词，如 后羿 / 后裔') }),
  }
);

export const webSearchTool = tool(
  async ({ query }) => {
    const results = await searchProvider.search(query, 5);
    if (!results.length) return '联网检索无结果（网络不可用或未检索到）';
    return results.map((r) => `标题：${r.title}\n链接：${r.url}\n摘要：${r.snippet.slice(0, 200)}`).join('\n\n');
  },
  {
    name: 'web_search',
    description: '联网检索最新信息（仅在本地知识库无法回答时使用），返回标题/链接/摘要供整合',
    schema: z.object({ query: z.string().describe('检索关键词，如 王者荣耀后羿打法思路') }),
  }
);
