/* ================================================================
   RUNTIME STORE — Infinite chat history and workforce run state
   Manages turns, continuous conversation, and accumulated files.
   ================================================================ */

import { create } from 'zustand';
import type { RunDefinition, RuntimeEvent } from '@/types/domain';

export interface ChatTurn {
  id: string;
  userPrompt: string;
  timestamp: string;
  runId?: string;
  run?: RunDefinition | null;
  events: RuntimeEvent[];
  error?: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  files?: Array<{ path: string; content: string; language?: string }>;
}

interface RuntimeState {
  turns: ChatTurn[];
  activeRun: RunDefinition | null;
  events: RuntimeEvent[];
  error: string | null;
  accumulatedFiles: Map<string, { path: string; content: string; language?: string }>;

  // Actions
  addTurn: (userPrompt: string) => string;
  updateTurnRun: (turnId: string, run: RunDefinition) => void;
  updateTurnEvents: (turnId: string, events: RuntimeEvent[]) => void;
  updateTurnError: (turnId: string, error: string | null) => void;
  updateTurnStatus: (turnId: string, status: ChatTurn['status']) => void;
  setRun: (run: RunDefinition | null) => void;
  setEvents: (events: RuntimeEvent[]) => void;
  setError: (error: string | null) => void;
  clearChat: () => void;
  getConversationContext: () => string;
}

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  turns: [],
  activeRun: null,
  events: [],
  error: null,
  accumulatedFiles: new Map(),

  addTurn: (userPrompt) => {
    const id = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTurn: ChatTurn = {
      id,
      userPrompt,
      timestamp: new Date().toISOString(),
      events: [],
      status: 'pending',
    };
    set((s) => ({
      turns: [...s.turns, newTurn],
      error: null,
    }));
    return id;
  },

  updateTurnRun: (turnId, run) => {
    set((state) => {
      const accumulated = new Map(state.accumulatedFiles);
      const resultFiles = (run.result as any)?.files;
      if (Array.isArray(resultFiles)) {
        for (const file of resultFiles) {
          if (file.path && typeof file.content === 'string') {
            accumulated.set(file.path, file);
          }
        }
      }

      const turns = state.turns.map((t) => {
        if (t.id === turnId) {
          return {
            ...t,
            runId: run.id,
            run,
            status: run.status.toLowerCase() as ChatTurn['status'],
            files: Array.isArray(resultFiles) ? resultFiles : t.files,
          };
        }
        return t;
      });

      return {
        turns,
        activeRun: run,
        accumulatedFiles: accumulated,
      };
    });
  },

  updateTurnEvents: (turnId, events) => {
    set((state) => ({
      events,
      turns: state.turns.map((t) => (t.id === turnId ? { ...t, events } : t)),
    }));
  },

  updateTurnError: (turnId, error) => {
    set((state) => ({
      error,
      turns: state.turns.map((t) => (t.id === turnId ? { ...t, error, status: 'failed' } : t)),
    }));
  },

  updateTurnStatus: (turnId, status) => {
    set((state) => ({
      turns: state.turns.map((t) => (t.id === turnId ? { ...t, status } : t)),
    }));
  },

  setRun: (activeRun) => {
    set((state) => {
      if (!activeRun) return { activeRun: null };
      // Update last turn if matches
      const turns = state.turns.map((t, idx) => {
        if (idx === state.turns.length - 1 || t.runId === activeRun.id) {
          return {
            ...t,
            runId: activeRun.id,
            run: activeRun,
            status: activeRun.status.toLowerCase() as ChatTurn['status'],
          };
        }
        return t;
      });
      return { activeRun, turns };
    });
  },

  setEvents: (events) => set({ events }),
  setError: (error) => set({ error }),

  clearChat: () => {
    set({
      turns: [],
      activeRun: null,
      events: [],
      error: null,
      accumulatedFiles: new Map(),
    });
  },

  getConversationContext: () => {
    const { turns, accumulatedFiles } = get();
    if (turns.length <= 1) return '';

    const priorTurns = turns.slice(0, -1);
    const historySnippets = priorTurns.map((t, idx) => {
      const resultText = (t.run?.result as any)?.text;
      const snippet = resultText ? (resultText.length > 500 ? `${resultText.slice(0, 480)}...` : resultText) : 'Delivered sub-tasks.';
      return `Turn ${idx + 1}:\nUser: ${t.userPrompt}\nWorkforce: ${snippet}`;
    });

    const fileList = Array.from(accumulatedFiles.keys());
    const fileSummary = fileList.length > 0 ? `\nExisting Files in Workspace:\n${fileList.map((f) => `- ${f}`).join('\n')}` : '';

    return `\n\n### Previous Conversation & Project Context\n${historySnippets.join('\n\n')}${fileSummary}\n`;
  },
}));
