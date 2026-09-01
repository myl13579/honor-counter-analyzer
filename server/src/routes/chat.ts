import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AGENT_MODE, hasCredentials } from '../config.js';
import { addMessage, createSession, getSession } from '../db.js';
import { runAgent, AgentUnavailableError, type AgentEvent } from '../agent/agentService.js';
import { buildAnalysis, chunkText } from '../agent/demoService.js';

const router = Router();

/** SSE 写入辅助 */
function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

router.post('/chat', async (req: Request, res: Response) => {
  const {
    message = '',
    sessionId: _sid,
    model,
    permissionMode = 'bypassPermissions',
  } = req.body ?? {};

  if (!message || !String(message).trim()) {
    res.status(400).json({ error: 'message 不能为空' });
    return;
  }

  const sessionId = _sid || randomUUID();
  if (!getSession(sessionId)) {
    createSession(sessionId, String(message).slice(0, 20));
  }
  addMessage(sessionId, 'user', String(message));

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // 决定运行模式
  const useAgent = AGENT_MODE === 'agent' || (AGENT_MODE !== 'demo' && hasCredentials());
  let mode: 'agent' | 'demo' = useAgent ? 'agent' : 'demo';
  sse(res, 'meta', { mode, sessionId });

  const assistantParts: string[] = [];
  const push = (text: string) => {
    assistantParts.push(text);
    sse(res, 'text', { content: text });
  };

  try {
    if (useAgent) {
      // 真 Agent 模式
      try {
        for await (const evt of runAgent({ prompt: message, sessionId, model, permissionMode })) {
          if (evt.type === 'text' && evt.content) push(evt.content);
          else if (evt.type === 'tool') sse(res, 'tool', { name: evt.toolName, content: evt.content });
          else if (evt.type === 'error') sse(res, 'error', { message: evt.message });
        }
      } catch (err) {
        if (err instanceof AgentUnavailableError && AGENT_MODE !== 'agent') {
          // 自动降级到演示模式
          mode = 'demo';
          sse(res, 'meta', { mode, degraded: true, reason: err.message });
          const { text } = buildAnalysis(String(message));
          for (const chunk of chunkText(text)) {
            await new Promise((r) => setTimeout(r, 12));
            push(chunk);
          }
        } else {
          sse(res, 'error', { message: String((err as Error).message) });
        }
      }
    } else {
      // 演示模式
      const { text } = buildAnalysis(String(message));
      for (const chunk of chunkText(text)) {
        await new Promise((r) => setTimeout(r, 12));
        push(chunk);
      }
    }

    const full = assistantParts.join('');
    if (full) addMessage(sessionId, 'assistant', full);
    sse(res, 'done', { sessionId, mode });
  } catch (err) {
    sse(res, 'error', { message: String((err as Error).message) });
  } finally {
    res.end();
  }
});

export default router;
