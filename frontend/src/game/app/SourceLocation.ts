// Maps a position in one of the game's scripts (a call stack frame's) back to its TypeScript, by the script's source
// map: the build's, a hidden .map file next to the script (vite.config.ts), or the development server's, inline.

/** A line of the game's sources: file is the path in frontend/src/game, line counts from 1. */
export interface SourcePosition {
  file: string;
  line: number;
}

interface SourceMap {
  sources: string[];
  sourceRoot?: string;
  mappings: string;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const maps = new Map<string, Promise<{ map: SourceMap; base: string } | null>>();

/** A source map segment's fields, base64 VLQs. */
function DecodeSegment(segment: string) {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = BASE64.indexOf(char);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

async function LoadMap(script: string) {
  const response = await fetch(script);
  if (!response.ok) return null;
  const text = await response.text();
  const at = text.lastIndexOf('sourceMappingURL=');
  const comment = at >= 0 ? text.slice(at + 'sourceMappingURL='.length).trim().split(/\s/)[0] : '';
  if (comment.startsWith('data:')) {
    // the page's Content-Security-Policy does not let fetch read data: URLs
    const bytes = Uint8Array.from(atob(comment.slice(comment.indexOf(',') + 1)), char => char.charCodeAt(0));
    return { map: JSON.parse(new TextDecoder().decode(bytes)) as SourceMap, base: script };
  }
  const url = new URL(comment || `${script.replace(/[?#].*$/, '')}.map`, script).href;
  const mapResponse = await fetch(url);
  return mapResponse.ok ? { map: await mapResponse.json() as SourceMap, base: url } : null;
}

/** The line of the game's sources that a script's line and column (from 1) were built from, if its map has it. */
export async function OriginalPosition(script: string, line: number, column: number): Promise<SourcePosition | null> {
  if (!script || line < 1) return null;
  if (!maps.has(script)) maps.set(script, LoadMap(script).catch(() => null));
  const loaded = await maps.get(script);
  if (!loaded) return null;
  const { map, base } = loaded;
  let source = 0;
  let sourceLine = 0;
  let found: { source: number; line: number } | null = null;
  const lines = map.mappings.split(';');
  for (let index = 0; index < line && index < lines.length; index++) {
    let generatedColumn = 0;
    for (const segment of lines[index].split(',')) {
      if (!segment) continue;
      const fields = DecodeSegment(segment);
      generatedColumn += fields[0];
      if (fields.length < 4) continue;
      source += fields[1];
      sourceLine += fields[2];
      // the last segment that starts at or before the column, on the frame's line
      if (index === line - 1 && generatedColumn <= column - 1) found = { source, line: sourceLine + 1 };
    }
  }
  if (!found || !map.sources[found.source]) return null;
  const path = decodeURIComponent(new URL((map.sourceRoot ? map.sourceRoot.replace(/\/?$/, '/') : '') + map.sources[found.source], base).pathname);
  const at = path.indexOf('/src/game/');
  return at >= 0 ? { file: path.slice(at + '/src/game/'.length), line: found.line } : null;
}
