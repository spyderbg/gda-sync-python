// The Markdown of Claude Code's reports, parsed for MarkdownText.vue, which draws it as Vue elements: never as HTML,
// so a report's text cannot add markup. It reads the parts reports use: paragraphs, headings, lists (nested), quotes,
// fenced code, tables, rules, and inline code, bold, italics and http(s) links. A single line break within a paragraph
// is kept, as in a GitHub comment.

export type Inline =
  | { kind: 'text' | 'code'; text: string }
  | { kind: 'strong' | 'em'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export type Block =
  | { kind: 'heading'; level: number; content: Inline[] }
  | { kind: 'paragraph'; lines: Inline[][] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'rule' }
  | { kind: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const ITEM = /^(\s*)([-*+]|(\d{1,9})[.)])(?:\s+(.*))?$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function indentOf(line: string) {
  return line.length - line.trimStart().length;
}

function startsBlock(line: string) {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);
}

export function parseMarkdown(text: string): Block[] {
  return parseBlocks(text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'));
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const indent = indentOf(line);
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].trimStart().startsWith(fence[1]); i++) {
        body.push(lines[i].slice(Math.min(indent, indentOf(lines[i]))));
      }
      i++;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, content: parseInline(heading[2]) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) body.push(lines[i].replace(QUOTE, ''));
      blocks.push({ kind: 'quote', blocks: parseBlocks(body) });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = cells(line);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) rows.push(cells(lines[i]));
      blocks.push({ kind: 'table', header, rows });
      continue;
    }
    if (ITEM.test(line)) {
      i = parseList(lines, i, blocks);
      continue;
    }
    const paragraph: string[] = [];
    for (; i < lines.length && lines[i].trim() && (!paragraph.length || !startsBlock(lines[i])); i++) paragraph.push(lines[i].trim());
    blocks.push({ kind: 'paragraph', lines: paragraph.map(parseInline) });
  }
  return blocks;
}

/** The list that starts at lines[start], added to blocks; the index of the line after it. */
function parseList(lines: string[], start: number, blocks: Block[]): number {
  const first = ITEM.exec(lines[start])!;
  const indent = first[1].length;
  const ordered = first[3] !== undefined;
  const items: Block[][] = [];
  let i = start;
  while (i < lines.length) {
    const item = ITEM.exec(lines[i]);
    if (!item || item[1].length !== indent || (item[3] !== undefined) !== ordered) break;
    const content = indent + item[2].length + 1;
    const body = [item[4] ?? ''];
    for (i++; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        // A blank line ends the item unless what follows is indented into it.
        let next = i + 1;
        while (next < lines.length && !lines[next].trim()) next++;
        if (next < lines.length && indentOf(lines[next]) > indent) {
          body.push('');
          continue;
        }
        break;
      }
      if (indentOf(line) <= indent && (ITEM.test(line) || startsBlock(line))) break;
      // Indented lines belong to the item; an unindented line goes on its last paragraph.
      body.push(line.slice(Math.min(content, indentOf(line))));
    }
    items.push(parseBlocks(body));
    // A blank line between two items keeps them in one list.
    let next = i;
    while (next < lines.length && !lines[next].trim()) next++;
    const sibling = next < lines.length ? ITEM.exec(lines[next]) : null;
    if (sibling && sibling[1].length === indent && (sibling[3] !== undefined) === ordered) i = next;
  }
  blocks.push({ kind: 'list', ordered, start: ordered ? Number(first[3]) : 1, items });
  return i;
}

function cells(line: string): Inline[][] {
  const row = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return row.split(/(?<!\\)\|/).map((cell) => parseInline(cell.trim().replace(/\\\|/g, '|')));
}

/** Whether the character at text[index] can open (side 1) or close (side -1) emphasis: next to text, not a space. */
function flanking(text: string, index: number, length: number, side: 1 | -1) {
  const inside = side === 1 ? text[index + length] : text[index - 1];
  const outside = side === 1 ? text[index - 1] : text[index + length];
  return inside !== undefined && !/\s/.test(inside) && (outside === undefined || /[\s\p{P}]/u.test(outside));
}

/** Where the emphasis that opens at text[start] with marker closes, or -1; an escaped marker does not close it. */
function closing(text: string, start: number, marker: string) {
  for (let at = text.indexOf(marker, start + marker.length + 1); at !== -1; at = text.indexOf(marker, at + 1)) {
    if (text[at - 1] === '\\' || (marker === '*' && (text[at + 1] === '*' || text[at - 1] === '*'))) continue;
    if (flanking(text, at, marker.length, -1)) return at;
  }
  return -1;
}

export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) result.push({ kind: 'text', text: plain });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length && /[\p{P}\p{S}]/u.test(text[i + 1])) {
      plain += text[i + 1];
      i += 2;
      continue;
    }
    if (char === '`') {
      const ticks = /^`+/.exec(text.slice(i))![0];
      const end = text.indexOf(ticks, i + ticks.length);
      if (end !== -1 && text[end + ticks.length] !== '`') {
        flush();
        const code = text.slice(i + ticks.length, end);
        result.push({ kind: 'code', text: /^ .* $/.test(code) && code.trim() ? code.slice(1, -1) : code });
        i = end + ticks.length;
        continue;
      }
      plain += ticks;
      i += ticks.length;
      continue;
    }
    // Italics start with a letter, digit or code, so a pattern such as *_tetra stays text.
    const marker = text.startsWith('**', i) ? '**' : char === '*' && /[\p{L}\p{N}`]/u.test(text[i + 1] ?? '') ? '*' : '';
    if (marker && flanking(text, i, marker.length, 1)) {
      const end = closing(text, i, marker);
      if (end !== -1) {
        flush();
        result.push({ kind: marker === '**' ? 'strong' : 'em', children: parseInline(text.slice(i + marker.length, end)) });
        i = end + marker.length;
        continue;
      }
    }
    const link = char === '[' ? /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(text.slice(i)) : null;
    if (link) {
      flush();
      result.push({ kind: 'link', href: link[2], children: parseInline(link[1]) });
      i += link[0].length;
      continue;
    }
    plain += char;
    i++;
  }
  flush();
  return result;
}
