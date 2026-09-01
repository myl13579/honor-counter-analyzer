import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH } from './config.js';

/**
 * 轻量 JSON 文件持久化（替代 better-sqlite3，避免 Windows 无 MSVC 无法编译原生模块）。
 * 数据模型：{ sessions: SessionRow[], messages: Record<sessionId, MessageRow[]> }
 * 采用同步读写，Node 单线程下天然无并发写冲突，满足本应用的会话持久化需求。
 */

interface DBShape {
  sessions: SessionRow[];
  messages: Record<string, MessageRow[]>;
}

export interface SessionRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
}

let db: DBShape = { sessions: [], messages: {} };
let nextMessageId = 1;

function load(): void {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      db = JSON.parse(raw) as DBShape;
      if (!db.messages) db.messages = {};
      if (!db.sessions) db.sessions = [];
      // 恢复自增 id
      for (const msgs of Object.values(db.messages)) {
        for (const m of msgs) nextMessageId = Math.max(nextMessageId, m.id + 1);
      }
    }
  } catch {
    db = { sessions: [], messages: {} };
  }
}

function persist(): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

load();

export function createSession(id: string, title = '新会话'): SessionRow {
  const now = Date.now();
  const s: SessionRow = { id, title, created_at: now, updated_at: now };
  db.sessions.unshift(s);
  db.messages[id] = [];
  persist();
  return s;
}

export function getSession(id: string): SessionRow | undefined {
  return db.sessions.find((s) => s.id === id);
}

export function listSessions(): SessionRow[] {
  return [...db.sessions].sort((a, b) => b.updated_at - a.updated_at);
}

export function updateSessionTime(id: string): void {
  const s = db.sessions.find((x) => x.id === id);
  if (s) s.updated_at = Date.now();
}

export function updateSessionTitle(id: string, title: string): void {
  const s = db.sessions.find((x) => x.id === id);
  if (s) {
    s.title = title;
    s.updated_at = Date.now();
    persist();
  }
}

export function addMessage(sessionId: string, role: string, content: string): MessageRow {
  const now = Date.now();
  const m: MessageRow = { id: nextMessageId++, session_id: sessionId, role, content, created_at: now };
  if (!db.messages[sessionId]) db.messages[sessionId] = [];
  db.messages[sessionId].push(m);
  updateSessionTime(sessionId);
  persist();
  return m;
}

export function getMessages(sessionId: string): MessageRow[] {
  return db.messages[sessionId] || [];
}

export function deleteSession(id: string): void {
  db.sessions = db.sessions.filter((s) => s.id !== id);
  delete db.messages[id];
  persist();
}

export default { createSession, getSession, listSessions, addMessage, getMessages, deleteSession };
