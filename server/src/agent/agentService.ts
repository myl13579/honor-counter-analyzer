import { query } from '@tencent-ai/agent-sdk';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { PROJECT_ROOT, MODEL } from '../config.js';

/** 真 Agent 模式抛出的认证/初始化错误，上层捕获后降级 demo */
export class AgentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentUnavailableError';
  }
}

export interface AgentEvent {
  type: 'text' | 'tool' | 'done' | 'error';
  content?: string;
  toolName?: string;
  message?: string;
}

export interface ChatOptions {
  prompt: string;
  sessionId?: string;
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions';
  model?: string;
}

/**
 * 真 Agent 流式推理（基于 @tencent-ai/agent-sdk query）
 * 返回 AsyncGenerator，逐段 yield AgentEvent。
 */
export async function* runAgent(opts: ChatOptions): AsyncGenerator<AgentEvent> {
  const q = query({
    prompt: opts.prompt,
    options: {
      cwd: PROJECT_ROOT,
      systemPrompt: SYSTEM_PROMPT,
      permissionMode: opts.permissionMode || 'bypassPermissions',
      model: opts.model || MODEL || undefined,
      sessionId: opts.sessionId || undefined,
      // 仅开放读类工具，Agent 只能读知识库，无法执行危险操作
      tools: ['Read', 'Grep', 'Glob'],
      includePartialMessages: true,
    },
  });

  try {
    for await (const message of q) {
      if (message.type === 'assistant') {
        const blocks = (message as any).message?.content ?? [];
        for (const block of blocks) {
          if (block.type === 'text' && block.text) {
            yield { type: 'text', content: block.text };
          } else if (block.type === 'tool_use') {
            yield { type: 'tool', toolName: block.name, content: JSON.stringify(block.input ?? {}) };
          } else if (block.type === 'tool_result') {
            yield { type: 'tool', toolName: 'tool_result', content: '' };
          }
        }
      } else if (message.type === 'result') {
        const result = message as any;
        if (result.subtype === 'error_max_turns' || result.subtype === 'error_during_execution') {
          yield { type: 'error', message: 'Agent 执行出错：' + (result.error || result.subtype) };
          return;
        }
      }
    }
    yield { type: 'done' };
  } catch (err: any) {
    const msg = String(err?.message || err);
    // 认证失败 / CLI 未就绪 / SDK 不可用 → 统一抛出，由上层降级 demo
    throw new AgentUnavailableError(msg);
  }
}
