import { useUiStore } from '@/store/ui-store';

export function SearchBar() {
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);

  return (
    <div className="search-bar">
      <div style={{ position: 'relative' }}>
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 14, padding: 0,
            }}
          >✕</button>
        )}
      </div>
    </div>
  );
}
