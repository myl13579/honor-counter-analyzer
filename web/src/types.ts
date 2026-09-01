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
  streaming?: boolean;
}

export interface ToolCall {
  name: string;
  content: string;
}

export const TYPE_ORDER = ['射手', '法师', '刺客', '战士', '坦克', '辅助'];
export const TYPE_COLORS: Record<string, string> = {
  战士: '#e37318',
  法师: '#a25bf0',
  坦克: '#3a7bd5',
  刺客: '#d33a3a',
  射手: '#2ba471',
  辅助: '#b08a3e',
};
