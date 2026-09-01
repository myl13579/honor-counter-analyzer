import { extractHeroes, getCounter, getHeroes, type CounterEntry, type Hero } from '../knowledge.js';

/** 基于定位生成克制理由（规则化、可解释） */
function reasonFor(counter: Hero | undefined, targetType: string): string {
  const cType = counter?.type_name || '';
  const rules: Array<[string, string, string]> = [
    ['刺客', '射手', '刺客突进高爆发，可快速切入秒杀脆皮射手'],
    ['刺客', '法师', '刺客突进切入，克制无位移法师的脆弱身板'],
    ['射手', '坦克', '射手持续输出/百分比伤害，克制坦克的肉盾'],
    ['法师', '坦克', '法师法术爆发可穿透坦克护甲（真实伤害类更佳）'],
    ['战士', '坦克', '战士真实伤害或持续输出能压制坦克回复'],
    ['战士', '射手', '战士贴身近战，克制射手输出距离'],
    ['法师', '射手', '法师控制+爆发，限制射手走位与输出'],
    ['坦克', '刺客', '坦克身板厚实，克制刺客的爆发秒杀'],
    ['辅助', '刺客', '控制型辅助可打断刺客突进，保护后排'],
  ];
  for (const [c, t, r] of rules) {
    if (cType === c && targetType === t) return r;
  }
  // 默认
  return `在定位与机制上形成克制关系（${cType} 对 ${targetType}）`;
}

/** 生成单个 counter 英雄的「召唤师技能 + 核心出装」描述（查该英雄自身知识库条目） */
function counterLoadout(name: string): string {
  const ce = getCounter(name);
  const summoner = ce?.summoner || '闪现';
  const build = ce?.build.length ? ce.build.join('、') : '视对局灵活选择';
  return `召唤师技能 ${summoner}，核心出装 ${build}`;
}

/** 单英雄分析文本 */
function singleHeroAnalysis(entry: CounterEntry): string {
  const heroes = getHeroes();
  const lines: string[] = [];
  lines.push(`### 敌方英雄：${entry.name}（${entry.type}）`);
  lines.push('');
  if (entry.countered_by.length) {
    // 最推荐 = 克制列表首项（数据生成时按推荐度排序）
    const top = entry.countered_by[0];
    const topEntry = getCounter(top);
    const topHero = heroes.find((h) => h.name === top);
    lines.push(`**⭐ 最推荐：${top}${topEntry ? `（${topEntry.type}）` : ''}**`);
    lines.push(`> ${reasonFor(topHero, entry.type)}`);
    lines.push(`> ${counterLoadout(top)}`);
    lines.push('');
    const rest = entry.countered_by.slice(1);
    if (rest.length) {
      lines.push('**其余 counter 英雄：**');
      for (const name of rest) {
        const hero = heroes.find((h) => h.name === name);
        lines.push(`- **${name}**：${reasonFor(hero, entry.type)} ｜ ${counterLoadout(name)}`);
      }
    }
  } else {
    lines.push('**该英雄暂无明确克制数据**，建议依据定位通用规律应对（仅供参考）。');
  }
  lines.push('');
  return lines.join('\n');
}

/** 整队分析文本 */
function teamAnalysis(entries: CounterEntry[]): string {
  const lines: string[] = [];
  const heroes = getHeroes();
  lines.push(`### 敌方阵容（${entries.length} 人）`);
  lines.push('');
  lines.push('**阵容构成：** ' + entries.map((e) => `${e.name}（${e.type}）`).join('、'));
  lines.push('');

  // 优先 counter 关键位置：先刺客/射手/法师（输出位），再坦克/辅助
  const priority = ['射手', '法师', '刺客', '战士', '坦克', '辅助'];
  const sorted = [...entries].sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
  lines.push('**整体克制思路：** 优先针对敌方输出位（射手/法师/刺客），再处理前排坦克。');
  lines.push('');

  for (const entry of sorted) {
    lines.push(`#### 针对 ${entry.name}（${entry.type}）`);
    if (entry.countered_by.length) {
      const top = entry.countered_by[0];
      const topEntry = getCounter(top);
      const topHero = heroes.find((h) => h.name === top);
      lines.push(`- ⭐ 最推荐 **${top}**：${reasonFor(topHero, entry.type)}（${counterLoadout(top)}）`);
      const rest = entry.countered_by.slice(1);
      if (rest.length) {
        lines.push(
          '- 其余：' +
            rest.map((n) => `${n}（${counterLoadout(n)}）`).join('、')
        );
      }
    } else {
      lines.push('暂无明确克制数据，依据定位通用规律应对（仅供参考）。');
    }
    lines.push('');
  }

  lines.push('**阵容协同建议：** 前排选坦度足、能开团的英雄抗压，后排注意走位防刺客切入，优先集火敌方核心输出位。');
  lines.push('');
  lines.push('> 克制关系随版本平衡调整，以上推荐仅供参考。');
  return lines.join('\n');
}

/** 生成完整分析文本（单英雄或整队） */
export function buildAnalysis(message: string): { heroes: string[]; text: string } {
  const heroes = extractHeroes(message);
  if (!heroes.length) {
    return {
      heroes,
      text: '未能从输入中识别到有效的英雄名，请在左侧面板勾选敌方英雄，或输入包含英雄名的描述（如「对面后羿、妲己怎么针对」）。',
    };
  }

  const entries = heroes
    .map((n) => getCounter(n))
    .filter((e): e is CounterEntry => Boolean(e));

  const missing = heroes.filter((n) => !entries.some((e) => e.name === n));

  const parts: string[] = [];
  if (entries.length === 1) {
    parts.push(singleHeroAnalysis(entries[0]));
  } else {
    parts.push(teamAnalysis(entries));
  }

  if (missing.length) {
    parts.push(`\n> ⚠️ 以下英雄暂无克制数据：${missing.join('、')}，请确认英雄名是否正确。`);
  }

  return { heroes, text: parts.join('\n') };
}

/** 将文本切分为流式分块（模拟 SSE 逐段输出） */
export function chunkText(text: string, size = 24): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
