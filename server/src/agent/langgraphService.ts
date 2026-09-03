import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { ChatDeepSeek } from '@langchain/deepseek';
import { HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { readKnowledgeTool, grepKnowledgeTool, webSearchTool } from './tools.js';
import { PLANNER_PROMPT, CRITIC_PROMPT, SYNTHESIZER_PROMPT } from './systemPrompt.js';

const TIMEOUT_MS = 60_000; // 单轮超时 1 分钟
const MAX_RETRY = 3; // 最大重试次数
const MAX_ITERATIONS = 8; // 循环上限，防死循环

class TimeoutError extends Error {
  constructor() {
    super('llm call timeout');
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

let llm: ChatDeepSeek | null = null;
function getLlm(): ChatDeepSeek {
  if (llm) return llm;
  llm = new ChatDeepSeek({ model: 'deepseek-chat', temperature: 0 });
  return llm;
}

const PlanSchema = z.object({
  steps: z.array(z.object({
    goal: z.string().describe('步骤目标'),
    tool: z.enum(['read_knowledge', 'grep_knowledge', 'web_search', 'none']).describe('该步骤使用的工具'),
  })),
});

const CriticSchema = z.object({
  decision: z.enum(['continue', 'replan', 'finish']),
  reason: z.string(),
});

interface PlanStep { goal: string; tool: 'read_knowledge' | 'grep_knowledge' | 'web_search' | 'none'; }

const FALLBACK_PLAN: PlanStep[] = [
  { goal: '在知识库中搜索用户提到的英雄', tool: 'grep_knowledge' },
  { goal: '读取知识库获取详细克制关系与出装', tool: 'read_knowledge' },
];

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => [],
  }),
  plan: Annotation<PlanStep[]>({ reducer: (_p, n) => n, default: () => [] }),
  stepIndex: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
  observations: Annotation<string[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => [],
  }),
  iterations: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
  retryCount: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
  timeoutFlag: Annotation<boolean>({ reducer: (_p, n) => n, default: () => false }),
  decision: Annotation<string>({ reducer: (_p, n) => n, default: () => 'continue' }),
  finalAnswer: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),
});

type AgentState = typeof StateAnnotation.State;

const TOOL_MAP: Record<string, { invoke: (args: Record<string, unknown>) => Promise<unknown> }> = {
  read_knowledge: readKnowledgeTool as unknown as { invoke: (args: Record<string, unknown>) => Promise<unknown> },
  grep_knowledge: grepKnowledgeTool as unknown as { invoke: (args: Record<string, unknown>) => Promise<unknown> },
  web_search: webSearchTool as unknown as { invoke: (args: Record<string, unknown>) => Promise<unknown> },
};

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const t = TOOL_MAP[name];
  if (!t) return `未知工具: ${name}`;
  try {
    const res = await t.invoke(args || {});
    return typeof res === 'string' ? res : JSON.stringify(res);
  } catch (e) {
    return `工具执行出错: ${(e as Error).message}`;
  }
}

async function plannerNode(state: AgentState): Promise<Partial<AgentState>> {
  const plannerLlm = getLlm().withStructuredOutput(PlanSchema);
  try {
    const result = await withTimeout(
      plannerLlm.invoke([new SystemMessage(PLANNER_PROMPT), ...state.messages]),
      TIMEOUT_MS
    );
    const steps: PlanStep[] = result?.steps?.length ? (result.steps as PlanStep[]) : FALLBACK_PLAN;
    return { plan: steps, stepIndex: 0, iterations: state.iterations + 1 };
  } catch (e) {
    if (e instanceof TimeoutError) return { timeoutFlag: true };
    throw e;
  }
}

async function executorNode(state: AgentState): Promise<Partial<AgentState>> {
  const step = state.plan[state.stepIndex];
  if (!step) return { stepIndex: state.stepIndex + 1 };

  const executorLlm = getLlm().bindTools([readKnowledgeTool, grepKnowledgeTool, webSearchTool]);
  const prompt = `你正在执行分析步骤 ${state.stepIndex + 1}/${state.plan.length}：${step.goal}\n请用合适的工具获取所需信息；若该步骤无需工具（tool 为 none），直接给出分析结论。`;

  try {
    const response = await withTimeout(
      executorLlm.invoke([new SystemMessage(prompt), ...state.messages]),
      TIMEOUT_MS
    );
    const toolCalls = (response as { tool_calls?: Array<{ id: string; name: string; args?: Record<string, unknown> }> }).tool_calls || [];
    const newObs: string[] = [];
    const toolMessages: ToolMessage[] = [];

    for (const call of toolCalls) {
      const result = await executeTool(call.name, call.args || {});
      newObs.push(`[${call.name}] ${result}`);
      toolMessages.push(new ToolMessage({ content: result, tool_call_id: call.id }));
    }

    if (!toolCalls.length) {
      const content = (response as { content?: unknown }).content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((b) => (b as { text?: string }).text || '').join('')
          : '';
      if (text) newObs.push(text);
    }

    return {
      messages: toolCalls.length ? [response, ...toolMessages] : [response],
      observations: newObs,
      stepIndex: state.stepIndex + 1,
      iterations: state.iterations + 1,
    };
  } catch (e) {
    if (e instanceof TimeoutError) return { timeoutFlag: true };
    throw e;
  }
}

async function criticNode(state: AgentState): Promise<Partial<AgentState>> {
  if (state.timeoutFlag) {
    return {
      decision: 'replan',
      retryCount: state.retryCount + 1,
      timeoutFlag: false,
      observations: ['[系统] 本轮思考超时，已注入提示：当前思路可能出现问题，可以换个思路思考。'],
    };
  }

  const obsText = state.observations.join('\n\n') || '（暂无信息）';
  const prompt = CRITIC_PROMPT.replace('{observations}', obsText);

  try {
    const criticLlm = getLlm().withStructuredOutput(CriticSchema);
    const result = await withTimeout(
      criticLlm.invoke([new SystemMessage(prompt), ...state.messages]),
      TIMEOUT_MS
    );
    return {
      decision: result.decision,
      retryCount: result.decision === 'replan' ? state.retryCount + 1 : state.retryCount,
    };
  } catch (e) {
    if (e instanceof TimeoutError) return { decision: 'replan', retryCount: state.retryCount + 1 };
    throw e;
  }
}

async function synthesizerNode(state: AgentState): Promise<Partial<AgentState>> {
  if (state.retryCount >= MAX_RETRY) {
    return { finalAnswer: '任务过于复杂，经过多次尝试仍未完成。请简化问题或分步描述（例如只问单个英雄的克制关系或打法）。' };
  }
  const obsText = state.observations.join('\n\n') || '（暂无信息）';
  const prompt = SYNTHESIZER_PROMPT.replace('{observations}', obsText);
  try {
    const result = await withTimeout(
      getLlm().invoke([new SystemMessage(prompt), ...state.messages]),
      TIMEOUT_MS
    );
    const content = (result as { content?: unknown }).content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((b) => (b as { text?: string }).text || '').join('')
        : '';
    return { finalAnswer: text };
  } catch (e) {
    if (e instanceof TimeoutError) {
      return { finalAnswer: '分析耗时过长，已终止。请简化问题后重试。' };
    }
    throw e;
  }
}

function routeAfterCritic(state: AgentState): string {
  if (state.retryCount >= MAX_RETRY) return 'synthesizer';
  if (state.decision === 'finish') return 'synthesizer';
  if (state.decision === 'replan') return 'planner';
  if (state.stepIndex < state.plan.length) return 'executor';
  return 'synthesizer';
}

function buildGraph() {
  return new StateGraph(StateAnnotation)
    .addNode('planner', plannerNode)
    .addNode('executor', executorNode)
    .addNode('critic', criticNode)
    .addNode('synthesizer', synthesizerNode)
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addEdge('executor', 'critic')
    .addConditionalEdges('critic', routeAfterCritic, {
      planner: 'planner',
      executor: 'executor',
      synthesizer: 'synthesizer',
    })
    .addEdge('synthesizer', END)
    .compile();
}

export type AgentEvent =
  | { type: 'plan'; content: string }
  | { type: 'tool'; name: string; content: string }
  | { type: 'text'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export async function* runGraph(prompt: string): AsyncGenerator<AgentEvent> {
  const graph = buildGraph();
  try {
    const stream = await graph.stream(
      { messages: [new HumanMessage(prompt)] },
      { streamMode: 'updates' }
    );
    for await (const update of stream) {
      for (const [nodeName, data] of Object.entries(update as Record<string, Partial<AgentState>>)) {
        if (nodeName === 'planner' && data.plan?.length) {
          yield { type: 'plan', content: JSON.stringify(data.plan) };
        } else if (nodeName === 'executor' && data.observations?.length) {
          for (const obs of data.observations) {
            yield { type: 'tool', name: 'executor', content: obs };
          }
        } else if (nodeName === 'synthesizer' && data.finalAnswer) {
          yield { type: 'text', content: data.finalAnswer };
        }
      }
    }
    yield { type: 'done' };
  } catch (e) {
    yield { type: 'error', message: (e as Error).message };
  }
}
