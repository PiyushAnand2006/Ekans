/**
 * File System Access Service & Codebase Exporter
 *
 * Uses the browser-native File System Access API to write agent-generated
 * code files to the user's local filesystem with full subfolder creation.
 * No external dependencies.
 */

import type { AgentDefinition, TaskDefinition } from '@/types/domain';

// ── Types ────────────────────────────────────────────────────────

export interface CodeBlock {
  filename: string;  // e.g. "frontend/public/index.html" or "backend/server.js"
  language: string;
  content: string;
  isCode: boolean;   // true if this is real code (not prose/markdown)
}

export interface SaveResult {
  success: boolean;
  filesWritten: string[];
  error?: string;
}

// ── Session-scoped directory handle ──────────────────────────────

let _dirHandle: FileSystemDirectoryHandle | null = null;

/**
 * Check if the File System Access API is available in this browser.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Get the currently selected directory name (if any).
 */
export function getSelectedDirectoryName(): string | null {
  return _dirHandle?.name ?? null;
}

/**
 * Prompt the user to pick a directory. Stores the handle for the session.
 */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser. Please use Chrome or Edge.');
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    _dirHandle = handle;
    return handle;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

/**
 * Ensure we have a directory handle. If not, prompt the user.
 */
async function ensureDirectory(): Promise<FileSystemDirectoryHandle> {
  if (_dirHandle) {
    const perm = await _dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return _dirHandle;
    const req = await _dirHandle.requestPermission({ mode: 'readwrite' });
    if (req === 'granted') return _dirHandle;
  }
  const handle = await pickDirectory();
  if (!handle) throw new Error('No directory selected.');
  return handle;
}

// ── Language → file extension mapping ────────────────────────────

const LANG_EXTENSIONS: Record<string, string> = {
  javascript: 'js', js: 'js', jsx: 'jsx',
  typescript: 'ts', ts: 'ts', tsx: 'tsx',
  python: 'py', py: 'py',
  java: 'java',
  c: 'c', cpp: 'cpp', 'c++': 'cpp', cxx: 'cpp',
  csharp: 'cs', 'c#': 'cs', cs: 'cs',
  go: 'go', golang: 'go',
  rust: 'rs', rs: 'rs',
  ruby: 'rb', rb: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt', kt: 'kt',
  scala: 'scala',
  html: 'html',
  css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  json: 'json',
  yaml: 'yaml', yml: 'yml',
  toml: 'toml',
  xml: 'xml',
  sql: 'sql',
  shell: 'sh', bash: 'sh', sh: 'sh', zsh: 'sh',
  powershell: 'ps1', ps1: 'ps1',
  dockerfile: 'Dockerfile',
  markdown: 'md', md: 'md',
  plaintext: 'txt', text: 'txt', txt: 'txt',
  r: 'r',
  dart: 'dart',
  lua: 'lua',
  perl: 'pl',
  haskell: 'hs',
  elixir: 'ex',
  erlang: 'erl',
  clojure: 'clj',
  graphql: 'graphql', gql: 'graphql',
  proto: 'proto', protobuf: 'proto',
  makefile: 'Makefile',
  cmake: 'cmake',
  ini: 'ini', conf: 'conf', cfg: 'cfg',
  env: 'env',
};

// Languages eligible for real code generation
const CODE_LANGUAGES = new Set([
  'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx',
  'python', 'py', 'java', 'c', 'cpp', 'c++', 'cxx', 'csharp', 'cs',
  'go', 'golang', 'rust', 'rs', 'ruby', 'rb', 'php', 'swift', 'kotlin', 'kt',
  'html', 'css', 'scss', 'sass', 'json', 'yaml', 'yml', 'toml', 'sql',
  'shell', 'bash', 'sh', 'powershell', 'ps1', 'dockerfile', 'xml', 'graphql',
  'proto', 'makefile', 'cmake', 'env', 'ini', 'conf'
]);

function extForLang(lang: string): string {
  return LANG_EXTENSIONS[lang.toLowerCase()] || lang.toLowerCase() || 'txt';
}

// ── Smart Code Detection & Path Categorization ────────────────────

/**
 * Determines if a code block is genuine actionable code (not plain text or trivial quote).
 */
export function isActionableCode(language: string, content: string): boolean {
  const lang = language.toLowerCase().trim();
  const trimmed = content.trim();

  // If language is plain narrative text or markdown prose, exclude
  if (['markdown', 'md', 'txt', 'text', 'plaintext', ''].includes(lang) && !lang.includes('file')) {
    return false;
  }

  // Must belong to recognized code languages
  if (lang && !CODE_LANGUAGES.has(lang)) {
    return false;
  }

  // Must have substantial code content (at least 2 lines or 25 chars of code)
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  if (lines.length === 1 && trimmed.length < 25 && !trimmed.includes('function') && !trimmed.includes('class') && !trimmed.includes('<')) {
    return false; // ignore single-line shell commands like `npm start`
  }

  return true;
}

/**
 * Intelligent Lovable/Replit-style path categorizer.
 * Maps files like `server.js` or `index.html` to `backend/server.js` or `frontend/public/index.html`.
 */
export function categorizeFilePath(rawPath: string, contextText: string, lang: string, index: number): string {
  let path = rawPath.trim().replace(/^[\/.]+/, '').replace(/['"()]/g, '');

  // Extract filename if path contains parens or section labels like "I. Backend ('server.js')"
  const filenameMatch = path.match(/([a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)/);
  let filename = filenameMatch ? filenameMatch[1] : path;

  // Normalize lower for checking
  const lowerFile = filename.toLowerCase();
  const lowerContext = contextText.toLowerCase();

  // If path ALREADY has explicit subdirectory (e.g. `frontend/src/App.tsx` or `backend/server.js`), use it
  if (path.includes('/') && (path.startsWith('frontend/') || path.startsWith('backend/') || path.startsWith('db/') || path.startsWith('devops/'))) {
    return path;
  }

  // Detect context (Backend vs Frontend vs DB)
  const isBackendContext = lowerContext.includes('backend') || lowerContext.includes('server') || lowerContext.includes('express') || lowerContext.includes('node') || lowerContext.includes('fastapi') || lowerContext.includes('flask') || lowerContext.includes('api');
  const isFrontendContext = lowerContext.includes('frontend') || lowerContext.includes('client') || lowerContext.includes('ui') || lowerContext.includes('web') || lowerContext.includes('react') || lowerContext.includes('html') || lowerContext.includes('css');
  const isDbContext = lowerContext.includes('database') || lowerContext.includes('sql') || lowerContext.includes('schema');

  // Specific filename auto-categorization
  if (lowerFile === 'index.html') {
    return 'frontend/public/index.html';
  }
  if (['style.css', 'styles.css', 'app.jsx', 'app.tsx', 'app.js', 'main.jsx', 'main.tsx', 'main.js', 'script.js'].includes(lowerFile)) {
    return `frontend/src/${filename}`;
  }
  if (['server.js', 'server.py', 'app.py', 'main.py', 'index.js', 'server_1.js', 'db.js', 'routes.js', 'config.js', 'models.py', 'database.py'].includes(lowerFile)) {
    return `backend/${filename}`;
  }
  if (lowerFile === 'package.json') {
    return isFrontendContext ? 'frontend/package.json' : 'backend/package.json';
  }
  if (lowerFile === 'schema.sql' || lowerFile.endsWith('.sql')) {
    return `db/${filename}`;
  }
  if (['dockerfile', 'docker-compose.yml', 'docker-compose.yaml'].includes(lowerFile)) {
    return filename; // root level
  }
  if (['readme.md', '.env', '.gitignore'].includes(lowerFile)) {
    return filename; // root level
  }

  // Section context fallback
  if (isBackendContext) {
    return `backend/${filename}`;
  }
  if (isFrontendContext) {
    return `frontend/${filename}`;
  }
  if (isDbContext) {
    return `db/${filename}`;
  }

  return filename;
}

// ── Extract code blocks from markdown with path detection ────────

/**
 * Parse markdown content and extract all fenced code blocks.
 * Filters out non-code content and infers Lovable/Replit-style subfolders.
 */
export function extractCodeBlocks(markdown: string, defaultFolderPrefix: string = ''): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = markdown.split('\n');
  let i = 0;
  let blockIndex = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      const langHint = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```

      const content = codeLines.join('\n');
      if (content.trim().length === 0) continue;

      // Detect language & filename hint
      const parts = langHint.split(/\s+/);
      const language = parts[0] || '';
      let filename = parts.length > 1 ? parts.slice(1).join(' ') : '';

      // Check if actionable code
      const isCode = isActionableCode(language, content);

      // Collect preceding 8 lines as context
      const contextLines = lines.slice(Math.max(0, i - codeLines.length - 10), i - codeLines.length - 1).join('\n');

      if (!filename) {
        filename = inferFilenameFromLines(lines, i - codeLines.length - 2, language, blockIndex);
      }

      // A code block without a semantic path cannot be safely exported.  Do not
      // invent code_1.ts-style files: the backend quality gate will request a
      // precise repair instead.
      if (!filename || /(?:^|\/)(?:code|file|output)_?\d*\.[\w-]+$/i.test(filename)) {
        blockIndex++;
        continue;
      }

      // Categorize into subfolders (e.g. backend/server.js or frontend/public/index.html)
      let categorizedPath = categorizeFilePath(filename, contextLines, language, blockIndex);

      if (defaultFolderPrefix && !categorizedPath.includes('/')) {
        categorizedPath = `${defaultFolderPrefix}/${categorizedPath}`;
      }

      blockIndex++;
      if (isCode) {
        blocks.push({ filename: categorizedPath, language, content, isCode });
      }
    } else {
      i++;
    }
  }

  return blocks;
}

/**
 * Try to infer a filename or relative filepath from context above the code block.
 */
function inferFilenameFromLines(lines: string[], precedingIndex: number, lang: string, index: number): string {
  for (let offset = 0; offset <= 3; offset++) {
    const checkIdx = precedingIndex - offset;
    if (checkIdx < 0 || checkIdx >= lines.length) continue;
    const line = lines[checkIdx].trim();

    // Regex patterns for filenames like:
    //  "I. Backend ('server.js')"
    //  "### 1. Frontend (`public/index.html`)"
    //  "// filename: backend/main.py"
    const patterns = [
      /(?:Backend|Frontend|Server|Client|Database)\s*\(?['"`]?([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)['"`]?\)?/i,
      /(?:filename|file|path):\s*['"`]?([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)['"`]?/i,
      /`([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)`/,
      /\*\*([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)\*\*/,
      /^\d+\.\s+([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/,
      /^[I|V|X]+\.\s+.*?\(([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)\)/i,
    ];

    for (const rx of patterns) {
      const m = line.match(rx);
      if (m?.[1]) {
        let path = m[1].trim().replace(/^[\/.]+/, '');
        if (path) return path;
      }
    }
  }

  return '';
}

// ── Aggregate code across all tasks/agents in a run ───────────────

/**
 * Gather all actionable code blocks from all tasks in a workforce run into a unified codebase list.
 * Deduplicates files and assigns Lovable/Replit style subfolders.
 */
export function collectRunCodeFiles(tasks: TaskDefinition[], agentsById: Map<string, AgentDefinition>): CodeBlock[] {
  const filesByPath = new Map<string, CodeBlock>();

  for (const task of tasks) {
    const taskResult = task.result as { text?: string } | null;
    const content = taskResult?.text || '';
    if (!content) continue;

    const agent = agentsById.get(task.assigned_agent_id);
    let defaultFolder = '';

    if (agent) {
      const role = (agent.role || agent.name).toLowerCase();
      if (role.includes('frontend') || role.includes('ui') || role.includes('react')) {
        defaultFolder = 'frontend';
      } else if (role.includes('backend') || role.includes('api') || role.includes('server')) {
        defaultFolder = 'backend';
      } else if (role.includes('database') || role.includes('sql')) {
        defaultFolder = 'db';
      } else if (role.includes('devops') || role.includes('docker')) {
        defaultFolder = 'devops';
      }
    }

    const blocks = extractCodeBlocks(content, defaultFolder);
    for (const block of blocks) {
      if (!block.isCode) continue;

      // A later correction replaces the earlier version of the same file.
      // Renaming collisions creates a broken project, so never do that.
      filesByPath.set(block.filename, block);
    }
  }

  return [...filesByPath.values()];
}

// ── Write code blocks to local filesystem (with subfolders) ───────

/**
 * Recursively save extracted code blocks to the user's chosen directory.
 * Automatically creates subdirectories (e.g. `backend/server.js` or `frontend/public/index.html`).
 */
export async function saveCodeBlocks(blocks: CodeBlock[]): Promise<SaveResult> {
  const codeOnly = blocks.filter((b) => b.isCode);
  if (codeOnly.length === 0) {
    return { success: false, filesWritten: [], error: 'No code blocks found to save.' };
  }

  try {
    const rootHandle = await ensureDirectory();
    const filesWritten: string[] = [];

    for (const block of codeOnly) {
      const normalizedPath = block.filename.replace(/\\/g, '/').replace(/^\/+/, '');
      const pathParts = normalizedPath.split('/').filter(Boolean);
      const filename = pathParts.pop() || 'code.txt';

      let currentDir = rootHandle;
      for (const dirName of pathParts) {
        const safeDir = dirName.replace(/[<>:"\\|?*]/g, '_');
        currentDir = await currentDir.getDirectoryHandle(safeDir, { create: true });
      }

      const safeFilename = filename.replace(/[<>:"\\|?*]/g, '_');
      const fileHandle = await currentDir.getFileHandle(safeFilename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(block.content);
      await writable.close();

      filesWritten.push(normalizedPath);
    }

    return { success: true, filesWritten };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save files.';
    return { success: false, filesWritten: [], error: message };
  }
}

/**
 * Convenience: extract code blocks from markdown and save them all.
 */
export async function saveCodeFromMarkdown(markdown: string): Promise<SaveResult> {
  const blocks = extractCodeBlocks(markdown);
  return saveCodeBlocks(blocks);
}

/**
 * Reset the stored directory handle (e.g. to pick a different directory).
 */
export function clearDirectoryHandle(): void {
  _dirHandle = null;
}
