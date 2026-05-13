import { create } from 'zustand';
import type { MemorySession, MazeSession, StepSession, TrainingModule } from '../utils/types';

interface TrainingState {
  currentModule: TrainingModule;
  // Memory
  memorySessions: MemorySession[];
  addMemorySession: (session: MemorySession) => void;
  // Maze
  mazeSessions: MazeSession[];
  addMazeSession: (session: MazeSession) => void;
  // Step
  stepSessions: StepSession[];
  addStepSession: (session: StepSession) => void;
  // Navigation
  setModule: (mod: TrainingModule) => void;
}

export const useTrainingStore = create<TrainingState>((set) => ({
  currentModule: 'memory',
  memorySessions: [],
  addMemorySession: (session) =>
    set((s) => ({ memorySessions: [...s.memorySessions, session] })),
  mazeSessions: [],
  addMazeSession: (session) =>
    set((s) => ({ mazeSessions: [...s.mazeSessions, session] })),
  stepSessions: [],
  addStepSession: (session) =>
    set((s) => ({ stepSessions: [...s.stepSessions, session] })),
  setModule: (mod) => set({ currentModule: mod }),
}));
