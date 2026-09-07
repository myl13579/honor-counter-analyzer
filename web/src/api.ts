import type { Hero, Session } from './types';

const BASE = '/api';

export async function getHeroes(): Promise<{ heroes: Hero[]; byType: Record<string, Hero[]> }> {
  const res = await fetch(`${BASE}/heroes`);
  return res.json();
}

export async function getAuthStatus(): Promise<{ hasCredentials: boolean; mode: string; authenticated: boolean }> {
  const res = await fetch(`${BASE}/auth/status`);
  return res.json();
}

export async function listSessions(): Promise<{ sessions: Session[] }> {
  const res = await fetch(`${BASE}/sessions`);
  return res.json();
}

export async function createSession(title = '新会话'): Promise<{ session: Session }> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return res.json();
}

export async function getMessages(sessionId: string): Promise<{ session: Session; messages: any[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/messages`);
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${BASE}/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function uploadImage(file: File): Promise<{ fileId: string; originalName: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data;
}

export interface StreamHandlers {
  onText: (content: string) => void;
  onTool?: (name: string, content: string) => void;
  onPlan?: (content: string) => void;
  onThought?: (node: string, content: string) => void;
  onMeta?: (meta: { mode: string; sessionId?: string; degraded?: boolean; reason?: string }) => void;
  onDone?: (sessionId: string) => void;
  onError?: (message: string) => void;
}

/** 基于 fetch 的 SSE 流式客户端（支持 POST body） */
export async function streamChat(body: Record<string, unknown>, handlers: StreamHandlers): Promise<void> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    handlers.onError?.(text || `请求失败 (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatch = (raw: string) => {
    const lines = raw.split('\n');
    let event = 'message';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        try {
          const data = JSON.parse(payload);
          if (event === 'text') handlers.onText(data.content || '');
          else if (event === 'tool') handlers.onTool?.(data.name || '工具', data.content || '');
          else if (event === 'plan') handlers.onPlan?.(data.content || '');
          else if (event === 'thought') handlers.onThought?.(data.node || '', data.content || '');
          else if (event === 'meta') handlers.onMeta?.(data);
          else if (event === 'done') handlers.onDone?.(data.sessionId || '');
          else if (event === 'error') handlers.onError?.(data.message || '未知错误');
        } catch {
          /* 忽略非 JSON 数据 */
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // 按事件边界切分
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      dispatch(chunk);
    }
  }
  if (buffer.trim()) dispatch(buffer);
}
