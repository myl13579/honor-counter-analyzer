import React from 'react';
import type { ChatMessage, Hero } from '../types';
import { TYPE_COLORS } from '../types';
import HeroAvatar from './HeroAvatar';

/** 召唤师技能集合（用于识别粗体内容是否为召唤师技能） */
const SUMMONERS = new Set([
  '惩击', '闪现', '治疗术', '净化', '终结', '狂暴', '弱化', '疾跑', '干扰', '晕眩',
]);

/** 工具名 → 中文标签 */
const TOOL_LABELS: Record<string, string> = {
  read_knowledge: '读知识库',
  grep_knowledge: '查知识库',
  web_search: '联网检索',
  none: '分析',
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] || tool;
}

/** 富化渲染：识别粗体（英雄名/召唤师技能/最推荐）、反引号装备、星级字符 */
function renderRich(text: string, heroMap: Record<string, Hero>): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      nodes.push(...renderBold(p.slice(2, -2), i, heroMap));
    } else if (p) {
      nodes.push(...renderPlain(p, i));
    }
  });
  return nodes;
}

/** 粗体内容：英雄名 → 头像；召唤师技能 → 标签；最推荐 → 高亮；其他 → strong */
function renderBold(inner: string, baseKey: number, heroMap: Record<string, Hero>): React.ReactNode[] {
  if (inner.includes('最推荐')) {
    return [<span key={baseKey} className="top-pick">⭐ 最推荐</span>];
  }
  const hero = heroMap[inner];
  if (hero) {
    return [
      <span key={baseKey} className="hero-inline">
        <HeroAvatar ename={hero.ename} name={hero.name} type={hero.type_name} size="sm" />
        <strong>{hero.name}</strong>
        <span className="hero-tag" style={{ background: TYPE_COLORS[hero.type_name] }}>
          {hero.type_name}
        </span>
      </span>,
    ];
  }
  if (SUMMONERS.has(inner)) {
    return [<span key={baseKey} className="summoner-tag">⚡ {inner}</span>];
  }
  return [<strong key={baseKey}>{inner}</strong>];
}

/** 普通文本：反引号 → 装备卡片；★☆ → 星级 */
function renderPlain(text: string, baseKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const parts = text.split(/(`[^`]+`)/g);
  parts.forEach((p, i) => {
    const key = `${baseKey}-${i}`;
    if (p.startsWith('`') && p.endsWith('`')) {
      nodes.push(<span key={key} className="equip-card">{p.slice(1, -1)}</span>);
    } else if (p) {
      nodes.push(...renderStars(p, key));
    }
  });
  return nodes;
}

function renderStars(text: string, baseKey: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const parts = text.split(/([★☆]+)/g);
  parts.forEach((p, i) => {
    const key = `${baseKey}-${i}`;
    if (p && /^[★☆]+$/.test(p)) {
      nodes.push(<span key={key} className="stars">{p}</span>);
    } else if (p) {
      nodes.push(<React.Fragment key={key}>{p}</React.Fragment>);
    }
  });
  return nodes;
}

const Markdown = React.memo(function Markdown({ text, heroMap }: { text: string; heroMap: Record<string, Hero> }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuf.length) {
      blocks.push(
        <ul key={`ul-${key++}`}>
          {listBuf.map((li, i) => (
            <li key={i}>{renderRich(li, heroMap)}</li>
          ))}
        </ul>
      );
      listBuf = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('### ')) {
      flushList();
      blocks.push(<h4 key={`h-${key++}`}>{renderRich(line.slice(4), heroMap)}</h4>);
    } else if (line.startsWith('#### ')) {
      flushList();
      blocks.push(<h5 key={`h-${key++}`}>{renderRich(line.slice(5), heroMap)}</h5>);
    } else if (line.startsWith('> ')) {
      flushList();
      blocks.push(<blockquote key={`q-${key++}`}>{renderRich(line.slice(2), heroMap)}</blockquote>);
    } else if (line.startsWith('- ')) {
      listBuf.push(line.slice(2));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={`p-${key++}`}>{renderRich(line, heroMap)}</p>);
    }
  }
  flushList();

  return <div className="markdown">{blocks}</div>;
});

const MessageBubble = React.memo(function MessageBubble({ msg, heroMap }: { msg: ChatMessage; heroMap: Record<string, Hero> }) {
  if (msg.role === 'user') {
    return (
      <div className="msg-row user">
        <div className="bubble user-bubble">{msg.content}</div>
      </div>
    );
  }

  return (
    <div className="msg-row assistant">
      <div className="bubble assistant-bubble">
        {msg.plan && msg.plan.length > 0 && (
          <div className="plan-card">
            <div className="plan-card-title">分析计划</div>
            {msg.plan.map((s, i) => (
              <div key={i} className="plan-step">
                <span className="plan-step-index">{i + 1}</span>
                <span className="plan-step-goal">{s.goal}</span>
                <span className="plan-step-tool">{toolLabel(s.tool)}</span>
              </div>
            ))}
          </div>
        )}
        {msg.content ? (
          <Markdown text={msg.content} heroMap={heroMap} />
        ) : (
          <span className="streaming-dot">思考中…</span>
        )}
        {msg.streaming && <span className="cursor" />}
      </div>
    </div>
  );
});

export default function ChatPanel({
  messages,
  empty,
  heroMap = {},
}: {
  messages: ChatMessage[];
  empty: React.ReactNode;
  heroMap?: Record<string, Hero>;
}) {
  if (!messages.length) {
    return <div className="chat-empty">{empty}</div>;
  }
  return (
    <div className="chat-panel">
      {messages.map((m) => (
        <MessageBubble key={m.id} msg={m} heroMap={heroMap} />
      ))}
    </div>
  );
}
