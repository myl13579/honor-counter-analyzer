export interface Hero {
  ename: number;
  name: string;
  title: string;
  hero_type: number;
  type_name: string;
}

export interface Session {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools?: ToolCall[];
  plan?: PlanStep[];
  streaming?: boolean;
}

export interface ToolCall {
  name: string;
  content: string;
}

export interface PlanStep {
  goal: string;
  tool: string;
}

export const TYPE_ORDER = ['射手', '法师', '刺客', '战士', '坦克', '辅助'];
// 定位主题色：法师-蓝、刺客-紫、射手-红（按 UI 设计规格）
export const TYPE_COLORS: Record<string, string> = {
  战士: '#f59e0b',
  法师: '#3b82f6',
  坦克: '#22d3ee',
  刺客: '#a855f7',
  射手: '#ef4444',
  辅助: '#f5b840',
};
