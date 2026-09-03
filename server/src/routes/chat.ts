import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AGENT_MODE, hasDeepSeekKey } from '../config.js';
import { addMessage, createSession, getSession } from '../db.js';
import { runGraph } from '../agent/langgraphService.js';
import { buildAnalysis, chunkText } from '../agent/demoService.js';

const router = Router();

/** SSE 写入辅助 */
function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

router.post('/chat', async (req: Request, res: Response) => {
  const { message = '', sessionId: _sid } = req.body ?? {};

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

  // 决定运行模式：配置了 DeepSeek Key 且未强制 demo 时走 LangGraph 循环
  const useAgent = hasDeepSeekKey() && AGENT_MODE !== 'demo';
  let mode: 'agent' | 'demo' = useAgent ? 'agent' : 'demo';
  sse(res, 'meta', { mode, sessionId });

  const assistantParts: string[] = [];
  const push = (text: string) => {
    assistantParts.push(text);
    sse(res, 'text', { content: text });
  };

  const runDemo = async () => {
    const { text } = buildAnalysis(String(message));
    for (const chunk of chunkText(text)) {
      await new Promise((r) => setTimeout(r, 12));
      push(chunk);
    }
  };

  try {
    if (useAgent) {
      // LangGraph 自主规划循环
      for await (const evt of runGraph(String(message))) {
        if (evt.type === 'plan' && evt.content) sse(res, 'plan', { content: evt.content });
        else if (evt.type === 'tool' && evt.content) sse(res, 'tool', { name: evt.name, content: evt.content });
        else if (evt.type === 'text' && evt.content) push(evt.content);
        else if (evt.type === 'error') {
          // LangGraph 出错 → 降级演示模式
          mode = 'demo';
          sse(res, 'meta', { mode, degraded: true, reason: evt.message });
          await runDemo();
        }
      }
    } else {
      await runDemo();
    }

    const full = assistantParts.join('');
    if (full) addMessage(sessionId, 'assistant', full);
    sse(res, 'done', { sessionId, mode });
  } catch (err) {
    console.error('[chat] 异常:', err);
    sse(res, 'error', { message: '服务暂时不可用，请稍后重试' });
  } finally {
    res.end();
  }
});

export default router;
