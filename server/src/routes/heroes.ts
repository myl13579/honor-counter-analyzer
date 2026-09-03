import { Router } from 'express';
import { getHeroesByType, getHeroes } from '../knowledge.js';
import { listSessions, getMessages, createSession, deleteSession, getSession, updateSessionTitle } from '../db.js';
import { randomUUID } from 'node:crypto';
import { hasDeepSeekKey, AGENT_MODE } from '../config.js';

const router = Router();

/** 英雄列表（按定位分组） */
router.get('/heroes', (_req, res) => {
  res.json({ heroes: getHeroes(), byType: getHeroesByType() });
});

/** 认证状态 */
router.get('/auth/status', (_req, res) => {
  res.json({
    hasCredentials: hasDeepSeekKey(),
    mode: AGENT_MODE,
    authenticated: hasDeepSeekKey() && AGENT_MODE !== 'demo',
  });
});

/** 会话列表 */
router.get('/sessions', (_req, res) => {
  res.json({ sessions: listSessions() });
});

/** 新建会话 */
router.post('/sessions', (req, res) => {
  const title = req.body?.title || '新会话';
  const id = randomUUID();
  const s = createSession(id, title);
  res.json({ session: s });
});

/** 会话消息 */
router.get('/sessions/:id/messages', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: '会话不存在' });
    return;
  }
  res.json({ session, messages: getMessages(req.params.id) });
});

/** 更新会话标题 */
router.patch('/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: '会话不存在' });
    return;
  }
  if (req.body?.title) updateSessionTitle(req.params.id, String(req.body.title));
  res.json({ ok: true });
});

/** 删除会话 */
router.delete('/sessions/:id', (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

export default router;
