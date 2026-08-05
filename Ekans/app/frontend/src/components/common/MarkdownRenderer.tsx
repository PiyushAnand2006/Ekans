import React, { useMemo } from 'react';

/**
 * Lightweight Markdown → React renderer.
 * Handles headings, bold, italic, bold-italic, inline code, code blocks,
 * bullet lists, numbered lists, horizontal rules, markdown tables, and paragraphs.
 * Pre-processes concatenated table rows (e.g. `||`) into clean HTML <table> elements.
 */

// ── Inline parsing ───────────────────────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Regex: code, bold-italic, bold, italic
  const rx = /(`[^`]+`)|(\*\*\*[^*]+?\*\*\*)|(\*\*[^*]+?\*\*)|(\*[^*]+?\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = rx.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    if (m.startsWith('`')) {
      parts.push(<code key={key++} className="md-inline-code">{m.slice(1, -1)}</code>);
    } else if (m.startsWith('***')) {
      parts.push(<strong key={key++}><em>{m.slice(3, -3)}</em></strong>);
    } else if (m.startsWith('**')) {
      parts.push(<strong key={key++}>{m.slice(2, -2)}</strong>);
    } else if (m.startsWith('*')) {
      parts.push(<em key={key++}>{m.slice(1, -1)}</em>);
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

// ── Helpers ──────────────────────────────────────────────────────

function splitPipeRow(rowStr: string): string[] {
  const cells = rowStr.split('|').map((c) => c.trim());
  if (cells.length > 0 && cells[0] === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('-')) return false;
  return /^[|\s:-]+$/.test(trimmed);
}

// ── Block parsing ────────────────────────────────────────────────

interface Block {
  type: 'heading' | 'paragraph' | 'bullet' | 'ordered' | 'code' | 'hr' | 'table';
  level?: number;        // heading level 1-6 or list nesting
  content?: string;
  items?: string[];      // list items
  lang?: string;         // code block language
  headers?: string[];    // table headers
  rows?: string[][];     // table rows
}

function parseBlocks(markdown: string): Block[] {
  // Pre-process: Replace double pipes `||` used as inline row separators with `\n|`
  const sanitized = markdown.replace(/\|\|\s*\|?/g, '|\n|');
  const lines = sanitized.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang });
      i++; // skip closing ```
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2] });
      i++;
      continue;
    }

    // Table detection: line has pipes and next line is a separator line
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitPipeRow(line);
      i += 2; // skip header and separator line
      const rows: string[][] = [];

      while (i < lines.length && lines[i].includes('|') && !isTableSeparator(lines[i])) {
        const rowCells = splitPipeRow(lines[i]);
        if (rowCells.length > 0) {
          rows.push(rowCells);
        }
        i++;
      }

      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Bullet list (-, *, •)
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'bullet', items });
      continue;
    }

    // Numbered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ordered', items });
      continue;
    }

    // Empty line → skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-empty lines that don't match special block starts
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^\*\*\*+$/.test(lines[i].trim()) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join(' ') });
    }
  }

  return blocks;
}

// ── Renderer ─────────────────────────────────────────────────────

function renderBlock(block: Block, index: number): React.ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag key={index} className={`md-h${block.level}`}>{parseInline(block.content || '')}</Tag>;
    }
    case 'paragraph':
      return <p key={index} className="md-p">{parseInline(block.content || '')}</p>;
    case 'bullet':
      return (
        <ul key={index} className="md-ul">
          {block.items!.map((item, j) => (
            <li key={j}>{parseInline(item)}</li>
          ))}
        </ul>
      );
    case 'ordered':
      return (
        <ol key={index} className="md-ol">
          {block.items!.map((item, j) => (
            <li key={j}>{parseInline(item)}</li>
          ))}
        </ol>
      );
    case 'code':
      return (
        <pre key={index} className="md-code-block">
          <code>{block.content}</code>
        </pre>
      );
    case 'table':
      return (
        <div key={index} className="md-table-wrapper">
          <table className="md-table">
            {block.headers && block.headers.length > 0 && (
              <thead>
                <tr>
                  {block.headers.map((h, j) => (
                    <th key={j}>{parseInline(h)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows?.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{parseInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr key={index} className="md-hr" />;
    default:
      return <p key={index}>{block.content}</p>;
  }
}

// ── Exported Component ───────────────────────────────────────────

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className={`md-rendered ${className || ''}`}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}
