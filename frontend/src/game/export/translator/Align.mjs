// Aligns a translated C++ file with the C++ file it ports, so that an export changes only what the TypeScript changed.
// Both are formatted by clang-format (translate.mjs), so their items start at the namespace's and the class's
// indentation. The alignment only makes changes that leave the code's meaning the same:
// - the items (declarations, definitions, constants) follow the original's order, and the translation's new items go
//   next to their neighbours there;
// - an item equivalent to the original's (the same but for parameter names in a declaration, [[maybe_unused]],
//   virtual/override/final, namespace qualifications) keeps the original's text;
// - a definition's body gets back the original's blank lines and comment lines between the statements both have;
// - the original's #includes stay, and the translation's are added unless the original's already include them.
// Code comes only from the translation: what the original has and the translation not is left out.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const INDENT = 4;

/** The brace, parenthesis and bracket depth a line changes, outside strings, characters and comments; and whether it
 * ends an item (; or } at depth 0). */
function Scan(line, depth) {
  let inString = null;
  let last = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '/' && line[i + 1] === '/') break;
    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }
    if ('{(['.includes(char)) depth++;
    else if ('})]'.includes(char)) depth--;
    if (!/\s/.test(char)) last = char;
  }
  return { depth, ends: depth === 0 && (last === ';' || last === '}') };
}

const indentOf = line => /^ */.exec(line)[0].length;

/** A body's items at an indentation: blank lines, comments, access specifiers (less indented) and items, an item
 * spanning the lines until its ; or its block's }. */
function Items(lines, indent) {
  const items = [];
  let current = null;
  let depth = 0;
  for (const line of lines) {
    if (current) {
      current.lines.push(line);
      const scan = Scan(line, depth);
      depth = scan.depth;
      if (scan.ends || (depth === 0 && indentOf(line) === indent && /^\s*}/.test(line))) current = null;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      items.push({ kind: 'blank', lines: [line] });
      continue;
    }
    if (indentOf(line) < indent) {
      items.push({ kind: 'access', lines: [line], label: trimmed });
      continue;
    }
    if (trimmed.startsWith('//')) {
      items.push({ kind: 'comment', lines: [line] });
      continue;
    }
    if (trimmed.startsWith('#')) {
      items.push({ kind: 'item', lines: [line], key: `#${trimmed}` });
      continue;
    }
    current = { kind: 'item', lines: [line] };
    items.push(current);
    const scan = Scan(line, 0);
    depth = scan.depth;
    if (scan.ends) current = null;
  }
  if (current && depth !== 0) throw new Error('unbalanced item');
  for (const item of items) if (item.kind === 'item' && !item.key) item.key = Key(item.lines);
  return items;
}

/** The code of lines, without comments. */
function Code(lines) {
  return lines.map(line => line.replace(/\/\/.*$/, '')).join('\n');
}

/** An item's name: a function's (with its class), a type's, an alias's, a field's or constant's. */
function Key(lines) {
  const code = Code(lines).replace(/\s+/g, ' ').trim();
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === '(' && depth === 0) {
      const name = /([~\w:]+)\s*$/.exec(code.slice(0, i))?.[1];
      if (name && !/^(if|for|while|switch|return)$/.test(name)) return `f:${name.replace(/^(Egt::)?(Game::)?(AlphaFamily::)?/, '')}`;
      break;
    }
    if (char === '{' || char === '=' || char === ';') break;
    if ('<'.includes(char)) depth++;
    if ('>'.includes(char)) depth--;
  }
  let match = /^(?:template\s*<[^>]*>\s*)?(?:class|struct|enum(?:\s+class)?|union)\s+(\w+)/.exec(code);
  if (match) return `c:${match[1]}`;
  match = /^using\s+(\w+)\s*=/.exec(code) ?? /^using\s+(?:namespace\s+)?([\w:]+)\s*;/.exec(code);
  if (match) return `u:${match[1]}`;
  if (/^namespace\b/.test(code)) return `n:${/^namespace\s*([\w:]*)/.exec(code)[1]}`;
  match = /(\w+)\s*(?:\[[^\]]*\])?\s*(?:=|\{|;)/.exec(code);
  return match ? `v:${match[1]}` : `t:${code}`;
}

/** A declaration or definition as its meaning: without attributes, virtual/override/final, namespace qualifications
 * and spacing; a declaration (no body) also without its parameters' names. */
let typeAliases = new Map();

function Meaning(lines, { names = true } = {}) {
  let code = Code(lines)
    // a C++ alias of a type is that type (ILocalization::LanguageCode is std::string)
    .replace(/\b(?:\w+::)*(\w+)\b/g, (all, name) => (typeAliases.has(name) && /^[\w:<>, ]+$/.test(typeAliases.get(name)) && /^[A-Z]/.test(name) ? typeAliases.get(name) : all))
    .replace(/\[\[maybe_unused\]\]\s*/g, '')
    .replace(/\bvirtual\s+/g, '')
    .replace(/\)\s*(const\s*)?(override|final)\b/g, (_, isConst) => `)${isConst ? ' const' : ''}`)
    .replace(/\b(Egt::)?Game::(AlphaFamily::)?(?=[A-Z])/g, '')
    .replace(/\bstd::(u?int\d+_t|size_t)\b/g, '$1')
    .replace(/\bFsm::(State::)?Reaction\b/g, 'Reaction')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),&*<>{};=:])\s*/g, '$1')
    .trim();
  // a parameter's own const (const bool x), which its callers do not see
  code = code.replace(/\(([^()]*)\)/, (_, params) => `(${params.split(',').map(param => param.replace(/^const ([\w:<>]+ \w+)(=.*)?$/, '$1$2')).join(',')})`);
  if (!names) code = code.replace(/\(([^()]*)\)/, (_, params) => `(${params.split(',').map(param => {
    const [declarator, ...value] = param.split('=');
    const unnamed = declarator.replace(/([\w>&*])\s*\b(?!(?:int|char|bool|long|short|double|float|unsigned|signed|auto|const)\b)[a-z_]\w*\s*$/i, (all, end) => (/[\w>&*]$/.test(end) && !/\b(?:const|unsigned|signed)$/.test(declarator.trim().replace(/\s*\w+$/, '')) ? end : all));
    return [unnamed, ...value].join('=');
  }).join(',')})`);
  return code;
}

/** The index of the line that opens a definition's body: the first { at depth 0 after its signature's parentheses. */
function BodyStart(lines) {
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\/\/.*$/, '');
    for (const char of line) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === '{' && depth === 0) return i;
    }
  }
  return -1;
}

/** The longest common subsequence of two lists, as pairs of indices. */
function Common(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const pairs = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** A statement as its meaning, so that statements written differently for the same are the same: ReturnUnless(x, v)
 * is ReturnIf(!x, v), a const or reference binding auto&& (as the translator writes it when it does not know),
 * x.front() x[0], std::min<common type>(a, b) std::min(a, b), a designated initializer without its type. */
export function Canonical(text) {
  // spaces only between words; a dereference's member (*x).y x->y
  text = text.replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim().replace(/ (?=\W)|(?<=\W) /g, '');
  text = text.replace(/\(\*(\w+)\)\./g, ' $1->').replace(/ (?=\W)|(?<=\W) /g, '');
  const negate = condition => (/^[\w:.<>]+(\([^()]*\))?$/.test(condition) ? `!${condition}` : `!(${condition})`);
  text = text.replace(/^(Assert)?(Return|Continue|Break)Unless\((.*?)(,(.*))?\);$/, (_, assert = '', kind, condition, rest = '') => `${assert}${kind}If(${negate(condition)}${rest});`);
  // a default-constructed struct (T{}, never a call)
  text = text.replace(/^auto (\w+)=(\w[\w:<>]*)\{\};$/, '$2 $1;');
  text = text.replace(/^(const )?auto(&{1,2}|\*)? ?(\w+)=/, 'auto&&$3=').replace(/^bool (\w+)=(true|false);$/, 'auto&&$1=$2;');
  text = text.replace(/^if\((?:const )?auto\*? ?(\w+)=/, 'if(auto $1=').replace(/\bfor\((?:const )?auto&{1,2}(\w+):/, 'for(auto&&$1:');
  text = text.replace(/\b(\w+)\.front\(\)/g, '$1[0]').replace(/\b(\w+)\[int64_t\(\1\.size\(\)\)-1\]/g, '$1.back()');
  text = WithoutCommonType(text).replace(/,(?=[}\]])/g, '');
  text = text.replace(/\b[A-Z]\w*(::\w+)*\{\./g, '{.');
  text = text.replace(/([(,])[A-Z]\w*(?:::\w+)*\{\}/g, '$1{}').replace(/^([^=]*[\w>]) ?(\w+)=\{\};$/, '$1 $2;');
  // a state's data by its interface's name: IGameManager::Statics is GameManagerStatics
  text = text.replace(/\bI(\w+)::(Nvrams|Statics)\b/g, '$1$2');
  text = text.replace(/\bthis->/g, '').replace(/\bFsm::(State::)?Reaction\b/g, 'Reaction').replace(/\b(Egt::)?Game::(AlphaFamily::)?(?=[A-Z])/g, '');
  // an optional's value: x.value().y is x->y, x.has_value() is x
  text = text.replace(/\.value\(\)\./g, '->').replace(/\b(\w+)\.has_value\(\)/g, '$1');
  // a container's size: compared with 0 is its empty(); its casts signed either way (never as no cast, which compares
  // differently), and a variable's cast to compare it with one
  const sized = '([\\w.>:-]+(?:\\([^()]*\\))?(?:[\\w.>-]+)?)';
  text = text.replace(new RegExp(`\\bint(?:64_t)?\\(${sized}\\.size\\(\\)\\)(!=|>)(?:int64_t\\(0\\)|0)(?!\\w)`, 'g'), '!$1.empty()')
    .replace(new RegExp(`\\bint(?:64_t)?\\(${sized}\\.size\\(\\)\\)==(?:int64_t\\(0\\)|0)(?!\\w)`, 'g'), '$1.empty()');
  text = text.replace(/\bint64_t\(([\w.>-]+\.size\(\))\)/g, 'int($1)').replace(/\bint64_t\((\w+)\)(<=?|>=?|==|!=)int\(/g, '$1$2int(');
  // a move is a copy, an optional's emplace(x) an assignment, (*x) *x, ++i in a for i++
  text = text.replace(/\bstd::move\(([^()]*(?:\([^()]*\))?)\)/g, '$1').replace(/^(.+)\.emplace\((.*)\);$/, '$1=$2;');
  // a default-constructed struct, a dereference's member

  text = text.replace(/=\((\*[^;]*)\);$/, '=$1;').replace(/;\+\+(\w+)\)$/, ';$1++)');
  // an algorithm over a whole range, std::sort(x.begin(), x.end()) std::ranges::sort(x); a declared type's qualification
  text = text.replace(/\bstd::(\w+)\((\w+)\.begin\(\),\2\.end\(\)/g, 'std::ranges::$1($2').replace(/^(?:\w+::)+(\w+ \w+;)$/, '$1');
  return text.replace(/ (?=\W)|(?<=\W) /g, '');
}

/** std::min<std::common_type_t<decltype(a), decltype(b)>>(a, b) as std::min(a, b): the template argument the translator
 * gives for operands of different integer types. */
function WithoutCommonType(text) {
  const start = /\bstd::(min|max)<std::common_type_t</g;
  let out = '';
  let last = 0;
  for (let match; (match = start.exec(text));) {
    let depth = 0;
    let i = match.index + `std::${match[1]}`.length;
    for (; i < text.length; i++) {
      if ('<('.includes(text[i])) depth++;
      else if ('>)'.includes(text[i]) && --depth === 0) break;
    }
    out += `${text.slice(last, match.index)}std::${match[1]}`;
    last = i + 1;
    start.lastIndex = last;
  }
  return out + text.slice(last);
}

/** A body's lines as statements: a statement's lines until its ; at depth 0 (or a block's { or }), each alone. */
function Statements(lines) {
  const units = [];
  let current = null;
  let depth = 0;
  for (const line of lines) {
    if (!current) {
      current = [];
      depth = 0;
    }
    current.push(line);
    depth = Scan(line, depth).depth;
    const code = line.replace(/\/\/.*$/, '').trim();
    // a block's { is alone on its line (BraceWrapping), a lambda's after its ]...: an initializer's { goes on
    const opens = code === '{' || /\]\s*(\([^()]*\))?\s*(mutable\s*)?(->\s*\S+\s*)?\{$/.test(code);
    const continues = /([=+\-*/%&|^<>?:,(]|&&|\|\|)$/.test(code);
    if ((depth <= 0 && !continues) || opens || !code) {
      units.push(current);
      current = null;
    }
  }
  if (current) units.push(current);
  return units;
}

const isCosmetic = unit => unit.every(line => !line.trim() || /^\s*\/\//.test(line));

/** The translation's lines with the original's blank and comment lines that lie between statements both have, and the
 * original's statement where one means the same. */
function Cosmetics(originalLines, translatedLines) {
  const original = Statements(originalLines);
  const translated = Statements(translatedLines);
  // a comment or blank line matches the same, a statement one that means the same
  const key = unit => (isCosmetic(unit) ? `\u0000${unit.map(line => line.trim()).join('\n')}` : Canonical(unit.join('\n')));
  const pairs = Common(original.map(key), translated.map(key));
  if (!pairs.length) return translatedLines;
  const out = [];
  const push = line => {
    if (!line.trim() && (!out.length || !out[out.length - 1].trim())) return;
    out.push(line);
  };
  let [previousO, previousT] = [-1, -1];
  for (const [oi, tj] of [...pairs, [original.length, translated.length]]) {
    const gapO = original.slice(previousO + 1, oi);
    const gapT = translated.slice(previousT + 1, tj);
    if (previousO >= 0 && oi < original.length && gapO.some(isCosmetic)) {
      // the original's cosmetic lines where they are among its code there: before, between (after as many of the
      // translation's statements) or after
      const codeO = gapO.filter(unit => !isCosmetic(unit)).length;
      let seen = 0;
      let emitted = 0;
      for (const unit of gapO) {
        if (!isCosmetic(unit)) {
          seen++;
          continue;
        }
        const at = codeO ? Math.round((seen / codeO) * gapT.length) : 0;
        while (emitted < at) out.push(...gapT[emitted++]);
        unit.forEach(push);
      }
      while (emitted < gapT.length) out.push(...gapT[emitted++]);
    } else {
      for (const unit of gapT) out.push(...unit);
    }
    // the original's text, its first line at the translation's indentation (clang-format indents the rest)
    if (oi < original.length) {
      const indent = /^ */.exec(translated[tj][0])[0];
      out.push(...original[oi].map((line, index) => (index ? line : `${indent}${line.trim()}`)));
    }
    [previousO, previousT] = [oi, tj];
  }
  return out;
}

/** A pair of items as one: the original's text where it means the same, else the translation's, with the original's
 * cosmetics. */
function Merge(original, translated, isSource, indent) {
  const bodyO = BodyStart(original.lines);
  const bodyT = BodyStart(translated.lines);
  const isDefinition = original.key.startsWith('f:') && bodyO >= 0 && bodyT >= 0;
  if (isDefinition && /^\s*(class|struct)\b/.test(original.lines[0]) === false) {
    const signatureO = original.lines.slice(0, bodyO + (original.lines[bodyO].trim() === '{' ? 0 : 1));
    const signatureT = translated.lines.slice(0, bodyT + (translated.lines[bodyT].trim() === '{' ? 0 : 1));
    // the original's, unless the translation's leaves a parameter unused that the original uses
    const unused = lines => new Set([...Code(lines).matchAll(/\[\[maybe_unused\]\][^,()]*?(\w+)\s*(?=[,)=])/g)].map(match => match[1]));
    const unusedO = unused(signatureO);
    const keepsUnused = [...unused(signatureT)].every(name => unusedO.has(name));
    // or the original leaves a parameter unnamed that the translation's body does not use
    const params = lines => /\(([^()]*)\)/.exec(Code(lines).replace(/\s+/g, ' '))?.[1].split(',').map(param => param.trim()).filter(Boolean) ?? [];
    const nameOf = param => (/\s([a-z_]\w*)\s*(=.*)?$/i.exec(param.replace(/\[\[maybe_unused\]\]/, '').trim()) ?? [])[1] ?? '';
    const [paramsO, paramsT] = [params(signatureO), params(signatureT)];
    const codeT = Code(translated.lines.slice(signatureT.length));
    const unnamedUnused = paramsO.length === paramsT.length && paramsO.every((param, i) => nameOf(param) === nameOf(paramsT[i])
      || (!nameOf(param) && nameOf(paramsT[i]) && !new RegExp(`\\b${nameOf(paramsT[i])}\\b`).test(codeT)));
    const sameTypes = Meaning(signatureO, { names: false }) === Meaning(signatureT, { names: false });
    const namedO = new Set(paramsO.map(nameOf));
    const keepsUnusedOrUnnamed = [...unused(signatureT)].every(name => unusedO.has(name) || !namedO.has(name));
    const signature = (Meaning(signatureO) === Meaning(signatureT) && keepsUnused) || (sameTypes && unnamedUnused && keepsUnusedOrUnnamed) ? signatureO : signatureT;
    const restO = original.lines.slice(signatureO.length);
    const restT = translated.lines.slice(signatureT.length);
    if (restO.join('\n') === restT.join('\n')) return [...signature, ...restO];
    return [...signature, ...Cosmetics(restO, restT)];
  }
  // a class or struct: its body aligned too
  if (original.key.startsWith('c:') && translated.key.startsWith('c:')) {
    const open = lines => lines.findIndex(line => line.trim() === '{');
    const [oOpen, tOpen] = [open(original.lines), open(translated.lines)];
    if (oOpen >= 0 && tOpen >= 0) {
      const headO = original.lines.slice(0, oOpen + 1);
      const headT = translated.lines.slice(0, tOpen + 1);
      const head = Meaning(headO).replace(/\s*\bfinal\b/g, '') === Meaning(headT).replace(/\s*\bfinal\b/g, '') ? headO : headT;
      const body = AlignItems(original.lines.slice(oOpen + 1, -1), translated.lines.slice(tOpen + 1, -1), indent + INDENT, isSource, true);
      return [...head, ...body, original.lines[original.lines.length - 1]];
    }
  }
  if (original.key.startsWith('n:') && translated.key.startsWith('n:')) {
    const open = lines => lines.findIndex(line => line.trim() === '{');
    const [oOpen, tOpen] = [open(original.lines), open(translated.lines)];
    if (oOpen >= 0 && tOpen >= 0) {
      const body = AlignItems(original.lines.slice(oOpen + 1, -1), translated.lines.slice(tOpen + 1, -1), indent + INDENT, isSource, false);
      return [...original.lines.slice(0, oOpen + 1), ...body, original.lines[original.lines.length - 1]];
    }
  }
  const same = Meaning(original.lines, { names: isSource }) === Meaning(translated.lines, { names: isSource });
  if (same) return original.lines;
  // a table, a lambda: the original's blank and comment lines between the lines both have
  return translated.lines.length > 1 ? Cosmetics(original.lines, translated.lines) : translated.lines;
}

/** The translation's anonymous namespace split as the original's several are: each item in the one that has it. */
function SplitNamespaces(original, translated, indent) {
  const isAnonymous = item => item.kind === 'item' && item.key === 'n:';
  const blocks = original.filter(isAnonymous);
  const ours = translated.filter(isAnonymous);
  if (blocks.length < 2 || ours.length !== 1) return translated;
  const inner = item => {
    const open = item.lines.findIndex(line => line.trim() === '{');
    return { head: item.lines.slice(0, open + 1), body: item.lines.slice(open + 1, -1), tail: item.lines.slice(-1) };
  };
  const keys = blocks.map(block => new Set(Items(inner(block).body, indent + INDENT).filter(item => item.kind === 'item').map(item => item.key)));
  const { head, body, tail } = inner(ours[0]);
  const parts = blocks.map(() => []);
  // an item no block has goes in the first, before what may use it; blank lines and comments with the next item
  let pending = [];
  for (const item of Items(body, indent + INDENT)) {
    if (item.kind !== 'item') {
      pending.push(...item.lines);
      continue;
    }
    const block = Math.max(0, keys.findIndex(set => set.has(item.key)));
    parts[block].push(...pending, ...item.lines);
    pending = [];
  }
  const split = parts.filter(lines => lines.some(line => line.trim())).map(lines => ({ kind: 'item', key: 'n:', lines: [...head, ...lines, ...tail] }));
  const at = translated.indexOf(ours[0]);
  return [...translated.slice(0, at), ...split, ...translated.slice(at + 1)];
}

/** A body's lines: the original's items in its order, merged with the translation's, and the translation's new items
 * next to their neighbours. */
function AlignItems(originalLines, translatedLines, indent, isSource, hasAccess, split = true) {
  const original = Items(originalLines, indent);
  const translated = split ? SplitNamespaces(original, Items(translatedLines, indent), indent) : Items(translatedLines, indent);
  if (split === true && translated.length !== Items(translatedLines, indent).length) {
    const lines = AlignItems(originalLines, translatedLines, indent, isSource, hasAccess, false);
    const splitLines = AlignItems(originalLines, translatedLines, indent, isSource, hasAccess, 'once');
    return DefinedBeforeUse(splitLines, indent) ? splitLines : lines;
  }
  // the translation's items by key, each with the access specifier it is under
  let access = null;
  const byKey = new Map();
  translated.forEach((item, index) => {
    if (item.kind === 'access') access = item.label;
    if (item.kind !== 'item') return;
    item.access = access;
    item.index = index;
    if (!byKey.has(item.key)) byKey.set(item.key, []);
    byKey.get(item.key).push(item);
  });
  const out = [];
  access = null;
  for (const item of original) {
    if (item.kind === 'access') access = item.label;
    if (item.kind !== 'item') {
      out.push({ ...item, access });
      continue;
    }
    const match = byKey.get(item.key)?.shift();
    // a forward declaration, a defaulted destructor are as none: the original's stay
    if (!match && /^\s*(class|struct)\s+\w+;\s*$/.test(Code(item.lines))) {
      out.push({ ...item, access });
      continue;
    }
    if (!match && /^\s*(virtual\s+)?~\w+\(\)\s*(override|final)?\s*(=\s*default)?;\s*$|^\s*\w+::~\w+\(\)\s*=\s*default;\s*$/.test(Code(item.lines))) {
      out.push({ ...item, access });
      continue;
    }
    if (!match) {
      // left out, with the comment just before it
      while (out.length && out[out.length - 1].kind === 'comment') out.pop();
      continue;
    }
    match.used = true;
    out.push({ kind: 'item', lines: Merge(item, match, isSource, indent), access, from: match });
  }
  // the translation's new items, after the item before them in the translation, in their access section
  for (const item of translated) {
    if (item.kind !== 'item' || item.used) continue;
    let at = -1;
    for (let index = item.index - 1; index >= 0 && at < 0; index--) {
      const previous = translated[index];
      if (previous.kind === 'item' && previous.used && (!hasAccess || previous.access === item.access)) at = out.findIndex(entry => entry.from === previous);
    }
    if (at < 0 && hasAccess) {
      at = out.findIndex(entry => entry.kind === 'access' && entry.label === item.access);
      if (at < 0 && item.access) {
        out.push({ kind: 'blank', lines: [''] }, { kind: 'access', lines: [`${' '.repeat(indent - INDENT)}${item.access}`], label: item.access });
        at = out.length - 1;
      }
    }
    const entry = { kind: 'item', lines: item.lines, access: item.access, from: item };
    item.used = true;
    const blank = !hasAccess && /\{\s*$/.test(item.lines.join('\n')) ? [{ kind: 'blank', lines: [''] }] : [];
    if (at < 0) out.unshift(entry, ...blank);
    else out.splice(at + 1, 0, ...blank, entry);
  }
  // no access specifier without items before the next, no blank lines at the ends or doubled
  const kept = out.filter((entry, index) => {
    if (entry.kind !== 'access') return true;
    for (let next = index + 1; next < out.length && out[next].kind !== 'access'; next++) if (out[next].kind === 'item') return true;
    return false;
  });
  const lines = [];
  for (const entry of kept) {
    for (const line of entry.lines) {
      if (!line.trim() && (!lines.length || !lines[lines.length - 1].trim())) continue;
      lines.push(line);
    }
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  // no blank line right after an access specifier, as clang-format has it (EmptyLineAfterAccessModifier: Never)
  return lines.filter((line, index) => line.trim() || !(index && indentOf(lines[index - 1]) < indent && /:\s*$/.test(lines[index - 1])));
}

/** Whether each name an anonymous namespace defines is used only after it. */
function DefinedBeforeUse(lines, indent) {
  const items = Items(lines, indent);
  let at = 0;
  for (const item of items) {
    if (item.kind === 'item' && item.key === 'n:') {
      const open = item.lines.findIndex(line => line.trim() === '{');
      let inner = at + open + 1;
      for (const entry of Items(item.lines.slice(open + 1, -1), indent + INDENT)) {
        const name = entry.kind === 'item' ? /^[vf]:(?:\w+::)*(\w+)$/.exec(entry.key)?.[1] : null;
        if (name && lines.slice(0, inner).some(line => new RegExp(`\\b${name}\\b`).test(line.replace(/\/\/.*$/, '')))) return false;
        inner += entry.lines.length;
      }
    }
    at += item.lines.length;
  }
  return true;
}

/** The headers a file includes, and theirs, as paths (resolved in the include roots). */
function IncludeClosure(file, includes, roots, seen = new Set()) {
  for (const include of includes) {
    const quoted = /^"(.*)"$/.exec(include)?.[1];
    const angled = /^<(.*)>$/.exec(include)?.[1];
    const candidates = quoted ? [join(dirname(file), quoted)] : angled ? roots.map(root => join(root, angled)) : [];
    const path = candidates.find(candidate => existsSync(candidate));
    seen.add(quoted ?? angled);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    let text = '';
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    IncludeClosure(path, [...text.matchAll(/^\s*#\s*include\s+([<"][^>"]+[>"])/gm)].map(match => match[1]), roots, seen);
  }
  return seen;
}

function IncludeRoots(cppRoot) {
  const roots = ['alpha_family/libs/src', 'libs/src', 'plugins/src'].map(root => join(cppRoot, root));
  try {
    for (const plugin of readdirSync(join(cppRoot, 'alpha_family/plugins'))) roots.push(join(cppRoot, 'alpha_family/plugins', plugin, 'src'));
  } catch {
    // no plugins
  }
  for (const project of ['game_core', 'integration', 'kernel']) roots.push(join(cppRoot, '..', project, 'libs', 'src'), join(cppRoot, '..', project, 'plugins', 'src'));
  return roots;
}

/** The translated file aligned with the original one at the same path, or as it is when it cannot be. */
export function Align(cppRoot, path, translated, aliases = new Map()) {
  typeAliases = aliases;
  const originalPath = join(cppRoot, path);
  if (!existsSync(originalPath)) return translated;
  try {
    const original = readFileSync(originalPath, 'utf8');
    const split = text => {
      const lines = text.replace(/\n$/, '').split('\n');
      // the class's namespace: the file's last (one before declares another namespace's names)
      const start = lines.findLastIndex(line => /^namespace\s+Egt::Game::AlphaFamily\s*$/.test(line));
      if (start < 0 || lines[start + 1] !== '{' || !/^};?\s*(\/\/.*)?$/.test(lines[lines.length - 1])) throw new Error('no namespace');
      return { preamble: lines.slice(0, start), head: lines.slice(start, start + 2), body: lines.slice(start + 2, -1), tail: lines[lines.length - 1] };
    };
    const o = split(original);
    const t = split(translated);
    const isSource = path.endsWith('.cpp');
    // the includes: the original's, and the translation's that the original's do not include
    const includeOf = line => /^\s*#\s*include\s+([<"][^>"]+[>"])/.exec(line)?.[1];
    const originalIncludes = o.preamble.map(includeOf).filter(Boolean);
    const closure = IncludeClosure(originalPath, originalIncludes, IncludeRoots(cppRoot));
    // ...nor the header of a class the original declares (class ReelRoundRules;)
    const declared = new Set([...original.matchAll(/^\s*(?:class|struct)\s+(\w+);\s*$/gm)].map(match => match[1]));
    const added = t.preamble.map(includeOf).filter(include => include && !closure.has(include.slice(1, -1))
      && !declared.has(include.slice(1, -1).split('/').pop().replace(/\.h$/, '')));
    const preamble = [...o.preamble];
    if (added.length) {
      const last = preamble.map(includeOf).lastIndexOf(originalIncludes[originalIncludes.length - 1]);
      preamble.splice(last + 1, 0, ...added.map(include => `#include ${include}`));
    }
    const body = AlignItems(o.body, t.body, INDENT, isSource, false);
    return `${[...preamble, ...o.head, ...body, o.tail].join('\n')}\n`;
  } catch (error) {
    if (process.env.EGT_ALIGN_DEBUG) console.error(`Align ${path}: ${error.stack}`);
    return translated;
  }
}
