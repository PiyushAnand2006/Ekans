import { OrgCanvas } from '@/components/canvas/OrgCanvas';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';
import { Toolbar } from '@/components/common/Toolbar';
import { SearchBar } from '@/components/common/SearchBar';
import { ContextMenu } from '@/components/common/ContextMenu';
import { ToastContainer } from '@/components/common/Toast';
import { CreateAgentDialog } from '@/components/dialogs/CreateAgentDialog';
import { DeleteConfirmDialog } from '@/components/dialogs/DeleteConfirmDialog';
import { useUiStore } from '@/store/ui-store';
import './App.css';

function App() {
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);

  return (
    <div className="app">
      <Toolbar />
      <div className="main-content">
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
      <ToastContainer />
    </div>
  );
}

export default App;
