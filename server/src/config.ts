import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 显式加载 server/.env（不依赖运行时 cwd），确保 DEEPSEEK_API_KEY 等环境变量生效
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// 项目根目录（server/src -> server -> 项目根）
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
export const KNOWLEDGE_DIR = path.join(PROJECT_ROOT, 'data', 'knowledge');
export const UPLOAD_DIR = path.join(PROJECT_ROOT, 'data', 'uploads');
export const DB_PATH = path.join(PROJECT_ROOT, 'data', 'db.json');

export const PORT = Number(process.env.PORT || 3000);

/** Agent 运行模式：agent=真Agent / demo=演示模式 / auto=自动检测（默认） */
export type AgentMode = 'agent' | 'demo' | 'auto';
export const AGENT_MODE: AgentMode = (process.env.AGENT_MODE as AgentMode) || 'auto';

/** 是否配置了 DeepSeek API Key（决定是否启用 LangGraph 自主规划循环） */
export function hasDeepSeekKey(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export const MODEL = process.env.AGENT_MODEL || '';
