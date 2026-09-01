import React from 'react';
import { Collapse } from 'tdesign-react';
import type { ChatMessage } from '../types';

/** 轻量 Markdown 渲染（支持标题/粗体/列表/引用，不解析 HTML） */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      nodes.push(<strong key={i}>{p.slice(2, -2)}</strong>);
    } else if (p) {
      nodes.push(<span key={i}>{p}</span>);
    }
  });
  return nodes;
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuf.length) {
      blocks.push(
        <ul key={`ul-${key++}`}>
          {listBuf.map((li, i) => (
            <li key={i}>{renderInline(li)}</li>
          ))}
        </ul>
      );
      listBuf = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('### ')) {
      flushList();
      blocks.push(<h4 key={`h-${key++}`}>{renderInline(line.slice(4))}</h4>);
    } else if (line.startsWith('#### ')) {
      flushList();
      blocks.push(<h5 key={`h-${key++}`}>{renderInline(line.slice(5))}</h5>);
    } else if (line.startsWith('> ')) {
      flushList();
      blocks.push(
        <blockquote key={`q-${key++}`}>{renderInline(line.slice(2))}</blockquote>
      );
    } else if (line.startsWith('- ')) {
      listBuf.push(line.slice(2));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={`p-${key++}`}>{renderInline(line)}</p>);
    }
  }
  flushList();

  return <div className="markdown">{blocks}</div>;
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
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
        {msg.tools && msg.tools.length > 0 && (
          <Collapse className="tool-collapse" borderless>
            <Collapse.Panel header={`🔧 工具调用 ${msg.tools.length} 次`} value="tools">
              <div className="tool-list">
                {msg.tools.map((t, i) => (
                  <div key={i} className="tool-item">
                    <span className="tool-name">{t.name}</span>
                    {t.content && <code className="tool-input">{t.content}</code>}
                  </div>
                ))}
              </div>
            </Collapse.Panel>
          </Collapse>
        )}
        {msg.content ? (
          <Markdown text={msg.content} />
        ) : (
          <span className="streaming-dot">思考中…</span>
        )}
        {msg.streaming && <span className="cursor" />}
      </div>
    </div>
  );
}

export default function ChatPanel({ messages, empty }: { messages: ChatMessage[]; empty: React.ReactNode }) {
  if (!messages.length) {
    return <div className="chat-empty">{empty}</div>;
  }
  return (
    <div className="chat-panel">
      {messages.map((m) => (
        <MessageBubble key={m.id} msg={m} />
      ))}
    </div>
  );
}
