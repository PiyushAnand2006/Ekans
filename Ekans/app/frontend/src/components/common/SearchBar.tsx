import { useUiStore } from '@/store/ui-store';
import { useLibraryStore } from '@/store/library-store';

export function SearchBar() {
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const openSaveTeamDialog = useUiStore((s) => s.openSaveTeamDialog);
  const activeTeamName = useLibraryStore((s) => s.activeTeamName);

  return (
    <div className="search-bar search-bar-atm">
      <div className="search-input-wrapper">
        <input
          className="search-input"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="search-clear"
            onClick={() => setSearchQuery('')}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
      <div className="search-bar-separator" />
      <button
        className="search-bar-save-btn"
        onClick={openSaveTeamDialog}
        title={activeTeamName ? `Save changes to ${activeTeamName} or save as new` : 'Save current workspace to Team Library'}
      >
        Save Team
      </button>
    </div>
  );
}

