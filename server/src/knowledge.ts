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

/** 精确/模糊匹配英雄名（"后裔" -> "后羿"） */
export function resolveHero(name: string): Hero | undefined {
  const trimmed = name.trim();
  const heroes = loadHeroes();
  // 1. 精确匹配
  const exact = heroes.find((h) => h.name === trimmed);
  if (exact) return exact;
  // 2. 包含匹配
  const contains = heroes.find((h) => trimmed.includes(h.name) || h.name.includes(trimmed));
  return contains;
}

/** 从任意文本中提取命中的英雄名列表 */
export function extractHeroes(text: string): string[] {
  const heroes = loadHeroes();
  const found: string[] = [];
  for (const h of heroes) {
    if (text.includes(h.name)) found.push(h.name);
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
