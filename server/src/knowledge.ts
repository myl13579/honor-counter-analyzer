import fs from 'node:fs';
import path from 'node:path';
import { KNOWLEDGE_DIR } from './config.js';

export interface Hero {
  ename: number;
  name: string;
  title: string;
  hero_type: number;
  type_name: string;
}

export interface CounterEntry {
  name: string;
  type: string;
  countered_by: string[];
  counters: string[];
  summoner: string;
  build: string[];
}

let heroes: Hero[] | null = null;
let counterMap: Map<string, CounterEntry> | null = null;

function loadHeroes(): Hero[] {
  if (heroes) return heroes;
  const raw = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'heroes.json'), 'utf-8');
  heroes = JSON.parse(raw) as Hero[];
  return heroes;
}

function loadCounters(): Map<string, CounterEntry> {
  if (counterMap) return counterMap;
  const raw = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'counters.md'), 'utf-8');
  counterMap = new Map();
  // 逐块解析：## 英雄名 [定位] 后跟 4 行字段
  const blocks = raw.split(/^## /m).slice(1);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const headerMatch = lines[0].match(/^(.+?)\s*\[(.+?)\]$/);
    if (!headerMatch) continue;
    const entry: CounterEntry = {
      name: headerMatch[1].trim(),
      type: headerMatch[2].trim(),
      countered_by: [],
      counters: [],
      summoner: '',
      build: [],
    };
    for (const line of lines.slice(1)) {
      const m = line.match(/^(countered_by|counters|summoner|build):\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2].trim();
      if (key === 'countered_by') entry.countered_by = value ? value.split('|').filter(Boolean) : [];
      else if (key === 'counters') entry.counters = value ? value.split('|').filter(Boolean) : [];
      else if (key === 'summoner') entry.summoner = value;
      else if (key === 'build') entry.build = value ? value.split('|').filter(Boolean) : [];
    }
    counterMap.set(entry.name, entry);
  }
  return counterMap;
}

/** 获取全部英雄 */
export function getHeroes(): Hero[] {
  return loadHeroes();
}

/** 按定位分组返回英雄 */
export function getHeroesByType(): Record<string, Hero[]> {
  const result: Record<string, Hero[]> = {};
  for (const h of loadHeroes()) {
    (result[h.type_name] ||= []).push(h);
  }
  return result;
}

/**
 * 常见同音/形近错别字与别名 → 正确英雄名。
 * 2 字英雄名若开放编辑距离（距离 1 = 50% 不同）会带来高误匹配，故用显式映射兜底。
 */
const HERO_ALIASES: Record<string, string> = {
  后裔: '后羿',
  妲已: '妲己',
  奕星: '弈星',
  赢政: '嬴政',
};

/** 编辑距离（Levenshtein），用于形近字容错 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/** 容错解析单个英雄名（别名优先 → 精确匹配 → 编辑距离兜底，"后裔" -> "后羿"） */
export function resolveHero(name: string): Hero | undefined {
  const trimmed = name.trim();
  const heroes = loadHeroes();
  // 1. 别名归一化 + 精确匹配
  const normalized = HERO_ALIASES[trimmed] ?? trimmed;
  const exact = heroes.find((h) => h.name === normalized);
  if (exact) return exact;
  // 2. 编辑距离兜底：仅 ≥3 字开放（2 字名误匹配风险高，交由别名表处理）
  const len = normalized.length;
  const maxDist = len >= 4 ? 2 : len >= 3 ? 1 : 0;
  if (maxDist === 0) return undefined;
  let best: Hero | undefined;
  let bestDist = Infinity;
  for (const h of heroes) {
    if (h.name[0] !== normalized[0]) continue; // 首字一致约束，降低误匹配
    const d = levenshtein(normalized, h.name);
    if (d <= maxDist && d < bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
}

/** 判断文本中是否包含指定英雄名（含错别字容错，复用 resolveHero） */
function fuzzyContains(text: string, heroName: string): boolean {
  const len = heroName.length;
  for (let i = 0; i + len <= text.length; i++) {
    if (resolveHero(text.slice(i, i + len))?.name === heroName) return true;
  }
  return false;
}

/** 从任意文本中提取命中的英雄名列表（精确匹配 + 同音/形近模糊匹配） */
export function extractHeroes(text: string): string[] {
  const heroes = loadHeroes();
  const found: string[] = [];
  for (const h of heroes) {
    if (text.includes(h.name)) {
      found.push(h.name);
      continue;
    }
    if (fuzzyContains(text, h.name)) found.push(h.name);
  }
  return found;
}

/** 获取某英雄的克制关系条目 */
export function getCounter(name: string): CounterEntry | undefined {
  return loadCounters().get(name);
}

/** 批量获取克制关系 */
export function getCounters(names: string[]): CounterEntry[] {
  const map = loadCounters();
  return names.map((n) => map.get(n)).filter((e): e is CounterEntry => Boolean(e));
}

/** 加载全部克制关系（供 Agent 兜底/统计） */
export function getAllCounters(): CounterEntry[] {
  return Array.from(loadCounters().values());
}
