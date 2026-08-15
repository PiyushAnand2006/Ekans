import { useEffect } from 'react';
import { OrgCanvas } from '@/components/canvas/OrgCanvas';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';
import { Toolbar } from '@/components/common/Toolbar';
import { SearchBar } from '@/components/common/SearchBar';
import { ContextMenu } from '@/components/common/ContextMenu';
import { ToastContainer } from '@/components/common/Toast';
import { CreateAgentDialog } from '@/components/dialogs/CreateAgentDialog';
import { DeleteConfirmDialog } from '@/components/dialogs/DeleteConfirmDialog';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { TeamLibrary } from '@/components/dialogs/TeamLibrary';
import { SaveTeamDialog } from '@/components/dialogs/SaveTeamDialog';
import { RunDashboard } from '@/components/runtime/RunDashboard';
import { useUiStore } from '@/store/ui-store';
import { useLibraryStore } from '@/store/library-store';
import { initVaultAutoSave } from '@/memory/vault-store';
import './App.css';

function App() {
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);

  // Initialize vault auto-save and library store on mount
  useEffect(() => {
    initVaultAutoSave();
    useLibraryStore.getState().loadFromStorage();
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="main-content">
        <RunDashboard />
        <div className="canvas-panel">
          <SearchBar />
          <OrgCanvas />
        </div>
        {inspectorOpen && <InspectorPanel />}
      </div>

      {/* Overlays */}
      <ContextMenu />
      <CreateAgentDialog />
      <DeleteConfirmDialog />
      <SettingsDialog />
      <SaveTeamDialog />
      <TeamLibrary />
      <ToastContainer />
    </div>
  );
}

export default App;

