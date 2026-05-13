// ============ 长期记忆训练 ============
export interface MemoryItem {
  id: string;
  name: string;
  answerKeywords?: string[];
  description: string;
  era: string; // 年代 e.g. "1950s", "1960s"
  category: string; // 分类
  imageUrl?: string;
  promptHint?: string; // 提示词
  source?: string;
}

export interface MemoryRound {
  item: MemoryItem;
  userAnswer: string;
  correct: boolean;
  timeSpent: number; // 秒
  attemptNo?: number;
  imageUrl?: string;
}

export interface MemorySession {
  id: string;
  date: string;
  rounds: MemoryRound[];
  totalCorrect: number;
  totalTime: number;
}

// ============ 迷宫训练 ============
export interface MazeCell {
  row: number;
  col: number;
  hasBlock: boolean;
  blockType: 'straight' | 'turn' | 'cross' | 'empty';
  blockRotation: number; // 0, 90, 180, 270
}

export interface MazeLED {
  position: number; // 0-4 (left to right)
  side: 'top' | 'bottom';
  active: boolean;
}

export interface MazePath {
  startLED: number; // top LED index (0-4)
  endLED: number; // bottom LED index (0-4)
}

export interface MazeSession {
  id: string;
  date: string;
  attempts: number;
  timeSpent: number;
  correct: boolean;
  path: MazePath;
}

// ============ 方步训练 ============
export interface StepCell {
  row: number;
  col: number;
  lit: boolean; // 当前亮灯
  stepped: boolean; // 已踩过
  isTarget: boolean; // 目标格
  order: number; // 踩踏顺序
}

export interface StepPath {
  cells: { row: number; col: number }[];
  mode?: 'straight' | 'diagonal' | 'cross' | 'random';
}

export interface StepSession {
  id: string;
  date: string;
  path: StepPath;
  accuracy: number;
  timeSpent: number;
  totalSteps: number;
  correctSteps: number;
}

// ============ 通用 ============
export type TrainingModule = 'memory' | 'maze' | 'step';
export type StepMode = 'straight' | 'diagonal' | 'cross' | 'random';

export interface TrainingReport {
  date: string;
  module: TrainingModule;
  score: number;
  details: Record<string, unknown>;
}

export interface UserProfile {
  name: string;
  age: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  preferences: {
    fontSize: 'large' | 'xlarge';
    audioEnabled: boolean;
    contrast: 'normal' | 'high';
  };
}
