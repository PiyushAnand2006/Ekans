import { create } from 'zustand';

interface UiState {
  selectedAgentId: string | null;
  inspectorOpen: boolean;
  createDialogOpen: boolean;
  createDialogParentId: string | null;
  deleteDialogAgentId: string | null;
  settingsOpen: boolean;
  libraryOpen: boolean;
  searchQuery: string;
  contextMenu: { x: number; y: number; agentId: string } | null;
}

interface UiActions {
  selectAgent: (id: string | null) => void;
  toggleInspector: () => void;
  openInspector: () => void;
  closeInspector: () => void;
  openCreateDialog: (parentId?: string | null) => void;
  closeCreateDialog: () => void;
  openDeleteDialog: (agentId: string) => void;
  closeDeleteDialog: () => void;
  toggleSettings: () => void;
  toggleLibrary: () => void;
  setSearchQuery: (query: string) => void;
  openContextMenu: (x: number, y: number, agentId: string) => void;
  closeContextMenu: () => void;
}

type UiStore = UiState & UiActions;

export const useUiStore = create<UiStore>((set) => ({
  selectedAgentId: null,
  inspectorOpen: false,
  createDialogOpen: false,
  createDialogParentId: null,
  deleteDialogAgentId: null,
  settingsOpen: false,
  libraryOpen: false,
  searchQuery: '',
  contextMenu: null,

  selectAgent: (id) => set({ selectedAgentId: id, inspectorOpen: id !== null }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  openInspector: () => set({ inspectorOpen: true }),
  closeInspector: () => set({ inspectorOpen: false }),
  openCreateDialog: (parentId = null) => set({ createDialogOpen: true, createDialogParentId: parentId }),
  closeCreateDialog: () => set({ createDialogOpen: false, createDialogParentId: null }),
  openDeleteDialog: (agentId) => set({ deleteDialogAgentId: agentId }),
  closeDeleteDialog: () => set({ deleteDialogAgentId: null }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  toggleLibrary: () => set((s) => ({ libraryOpen: !s.libraryOpen })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  openContextMenu: (x, y, agentId) => set({ contextMenu: { x, y, agentId } }),
  closeContextMenu: () => set({ contextMenu: null }),
}));
