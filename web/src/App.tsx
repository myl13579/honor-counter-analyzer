import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Button, MessagePlugin, Input, Tag } from 'tdesign-react';
import { AddIcon, DeleteIcon, SendIcon } from 'tdesign-icons-react';
import HeroSelector from './components/HeroSelector';
import ChatPanel from './components/ChatPanel';
import { getHeroes, getAuthStatus, listSessions, createSession, getMessages, deleteSession, streamChat, uploadImage } from './api';
import type { Hero, Session, ChatMessage, ToolCall } from './types';

export default function App() {
  const [byType, setByType] = useState<Record<string, Hero[]>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [mode, setMode] = useState<'agent' | 'demo'>('demo');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputFileRef = useRef<HTMLInputElement>(null);

  // 英雄名 -> 英雄信息映射，供分析结果富化渲染（头像/定位标签）
  const heroMap = useMemo(() => {
    const m: Record<string, Hero> = {};
    Object.values(byType).forEach((list) => list.forEach((h) => (m[h.name] = h)));
    return m;
  }, [byType]);

  // 初始化
  useEffect(() => {
    (async () => {
      const [heroesData, auth, sessionsData] = await Promise.all([
        getHeroes(),
        getAuthStatus(),
        listSessions(),
      ]);
      setByType(heroesData.byType);
      setMode(auth.mode === 'agent' || auth.authenticated ? 'agent' : 'demo');
      setSessions(sessionsData.sessions);
      const saved = localStorage.getItem('hca_session');
      const current = saved && sessionsData.sessions.some((s) => s.id === saved) ? saved : sessionsData.sessions[0]?.id;
      if (current) {
        setSessionId(current);
        const { messages: msgs } = await getMessages(current);
        setMessages(
          msgs.map((m: any) => ({
            id: String(m.id),
            role: m.role,
            content: m.content,
          }))
        );
      }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const toggleHero = useCallback(
    (name: string) => {
      setSelected((prev) => {
        if (prev.includes(name)) return prev.filter((n) => n !== name);
        if (prev.length >= 5) {
          MessagePlugin.warning('敌方最多选择 5 个英雄');
          return prev;
        }
        return [...prev, name];
      });
    },
    []
  );

  const newSession = useCallback(async () => {
    const { session } = await createSession();
    setSessions((prev) => [session, ...prev]);
    setSessionId(session.id);
    setMessages([]);
    setSelected([]);
    localStorage.setItem('hca_session', session.id);
  }, []);

  const switchSession = useCallback(async (id: string) => {
    setSessionId(id);
    localStorage.setItem('hca_session', id);
    const { messages: msgs } = await getMessages(id);
    setMessages(
      msgs.map((m: any) => ({ id: String(m.id), role: m.role, content: m.content }))
    );
  }, []);

  const removeSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      const rest = sessions.filter((s) => s.id !== id);
      setSessions(rest);
      if (sessionId === id) {
        setMessages([]);
        setSessionId('');
        localStorage.removeItem('hca_session');
      }
    },
    [sessions, sessionId]
  );

  const doAnalyze = useCallback(
    async (prompt: string, display: string) => {
      if (!prompt.trim()) return;
      if (busy) return;

      let sid = sessionId;
      if (!sid) {
        const { session } = await createSession(display.slice(0, 20));
        sid = session.id;
        setSessionId(sid);
        setSessions((prev) => [session, ...prev]);
        localStorage.setItem('hca_session', sid);
      }

      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: display },
        { id: `a-${Date.now()}`, role: 'assistant', content: '', tools: [], streaming: true },
      ]);
      setBusy(true);

      const updateAssistant = (updater: (m: ChatMessage) => ChatMessage) => {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') copy[copy.length - 1] = updater(last);
          return copy;
        });
      };

      await streamChat(
        { message: prompt, sessionId: sid },
        {
          onText: (content) =>
            updateAssistant((m) => ({ ...m, content: m.content + content })),
          onTool: (name, content) =>
            updateAssistant((m) => ({
              ...m,
              tools: [...(m.tools || []), { name, content } as ToolCall],
            })),
          onMeta: (meta) => {
            if (meta.mode) setMode(meta.mode === 'agent' ? 'agent' : 'demo');
            if (meta.degraded) {
              MessagePlugin.info('真 Agent 不可用，已自动切换为演示模式');
            }
          },
          onDone: () => updateAssistant((m) => ({ ...m, streaming: false })),
          onError: (msg) => {
            updateAssistant((m) => ({ ...m, streaming: false, content: m.content + `\n> ⚠️ ${msg}` }));
          },
        }
      );

      setBusy(false);
      // 刷新会话列表（更新时间/标题）
      const { sessions: s } = await listSessions();
      setSessions(s);
    },
    [busy, sessionId]
  );

  const analyzeSelected = useCallback(() => {
    if (!selected.length) {
      MessagePlugin.warning('请先勾选敌方英雄（1~5 个）');
      return;
    }
    const names = selected.join('、');
    doAnalyze(`敌方阵容：${names}，请给出完整克制分析。`, `敌方阵容：${names}`);
  }, [selected, doAnalyze]);

  const sendFreeText = useCallback(() => {
    const t = input.trim();
    if (!t) return;
    setInput('');
    doAnalyze(t, t);
  }, [input, doAnalyze]);

  const onUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        MessagePlugin.error('请上传图片文件');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        MessagePlugin.error('图片大小需小于 5MB');
        return;
      }
      setUploading(true);
      try {
        await uploadImage(file);
        MessagePlugin.info('图片已上传。演示模式下暂不支持自动识别，请在面板勾选英雄；认证真 Agent 后可直接读图识别。');
      } catch (e: any) {
        MessagePlugin.error(e.message || '上传失败');
      } finally {
        setUploading(false);
      }
    },
    []
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="logo">⚔️</span>
          <div>
            <h1>王者对局分析 Agent</h1>
            <span className="subtitle">Honor Counter Analyzer</span>
          </div>
        </div>
        <div className="header-right">
          <span className={`mode-badge ${mode}`}>{mode === 'agent' ? 'Agent 推理' : '演示模式'}</span>
          <Button icon={<AddIcon />} onClick={newSession}>
            新建会话
          </Button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="side-card primary">
            <h3>① 选择敌方英雄</h3>
            <p className="hint">按定位筛选，勾选 1~5 人</p>
            <HeroSelector byType={byType} selected={selected} onToggle={toggleHero} />
            <div className="selected-row">
              {selected.map((n) => (
                <Tag key={n} closable onClose={() => toggleHero(n)}>
                  {n}
                </Tag>
              ))}
              {!selected.length && <span className="placeholder">未选择英雄</span>}
            </div>
            <Button theme="primary" block disabled={!selected.length || busy} onClick={analyzeSelected}>
              🎯 发起克制分析
            </Button>
          </div>

          <div className="side-card secondary">
            <h3>② 上传截图识别（可选）</h3>
            <p className="hint">上传选英雄/对局截图，自动识别敌方英雄</p>
            <input
              ref={inputFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = '';
              }}
            />
            <Button variant="outline" block loading={uploading} onClick={() => inputFileRef.current?.click()}>
              📷 上传截图
            </Button>
          </div>

          <div className="side-card secondary">
            <h3>③ 会话历史</h3>
            <div className="session-list">
              {sessions.map((s) => (
                <div key={s.id} className={`session-item ${s.id === sessionId ? 'active' : ''}`} onClick={() => switchSession(s.id)}>
                  <span className="session-title">{s.title}</span>
                  <DeleteIcon
                    className="session-del"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSession(s.id);
                    }}
                  />
                </div>
              ))}
              {!sessions.length && <span className="placeholder">暂无会话</span>}
            </div>
          </div>
        </aside>

        <main className="main">
          <div className="chat-titlebar">
            <div>
              <div className="chat-title">对局分析</div>
              <div className="chat-title-sub">
                {mode === 'agent' ? 'Agent 实时推理' : '本地知识库分析'}
              </div>
            </div>
            <div className="chat-meta">
              <span className={`mode-badge ${mode}`}>
                {mode === 'agent' ? 'Agent 推理' : '演示模式'}
              </span>
            </div>
          </div>
          <div className="chat-wrap" ref={scrollRef}>
            <ChatPanel
              messages={messages}
              heroMap={heroMap}
              empty={
                <div className="empty-hint">
                  <div className="empty-icon">⚔️</div>
                  <p>在左侧勾选敌方英雄，或直接输入自然语言</p>
                  <p className="sub">例：对面后羿、妲己怎么针对？</p>
                </div>
              }
            />
          </div>
          <div className="input-area">
            <Input
              value={input}
              onChange={(v) => setInput(v as string)}
              placeholder="输入敌方英雄或对局问题，例如：对面后羿加蔡文姬怎么打"
              onEnter={sendFreeText}
              disabled={busy}
            />
            <Button theme="primary" icon={<SendIcon />} disabled={busy || !input.trim()} onClick={sendFreeText}>
              发送
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
