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
import { RunDashboard } from '@/components/runtime/RunDashboard';
import { useUiStore } from '@/store/ui-store';
import { initVaultAutoSave } from '@/memory/vault-store';
import './App.css';

function App() {
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);

  // Initialize vault auto-save on mount
  useEffect(() => {
    initVaultAutoSave();
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="main-content">
        <div className="canvas-panel">
          <SearchBar />
          <OrgCanvas />
          <RunDashboard />
        </div>
        {inspectorOpen && <InspectorPanel />}
      </div>

      {/* Overlays */}
      <ContextMenu />
      <CreateAgentDialog />
      <DeleteConfirmDialog />
      <SettingsDialog />
      <ToastContainer />
    </div>
  );
}

export default App;
