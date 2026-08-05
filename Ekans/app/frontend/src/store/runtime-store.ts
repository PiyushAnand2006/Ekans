import { create } from 'zustand';
import type { RunDefinition, RuntimeEvent } from '@/types/domain';

interface RuntimeState {
  activeRun: RunDefinition | null;
  events: RuntimeEvent[];
  error: string | null;
  setRun: (run: RunDefinition | null) => void;
  setEvents: (events: RuntimeEvent[]) => void;
  setError: (error: string | null) => void;
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  activeRun: null,
  events: [],
  error: null,
  setRun: (activeRun) => set({ activeRun }),
  setEvents: (events) => set({ events }),
  setError: (error) => set({ error }),
}));
