// An index of the C++ game sources' headers, which the translator resolves the TypeScript's names against: the header
// that declares a class, struct, enum or alias (its #include), and a class's methods, bases and events, so that a
// translated class overrides an interface's methods with their exact signatures and handles its events with their
// exact argument types.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const INCLUDE_ROOTS = ['alpha_family/libs/src', 'libs/src', 'plugins/src'];

function* headers(folder) {
  let names = [];
  try {
    names = readdirSync(folder);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) yield* headers(path);
    else if (name.endsWith('.h')) yield path;
  }
}

/** The text between a `{` and its `}`. */
function braceBody(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

/** The classes, structs, enums, aliases and capitalized namespaces a header declares, each with the namespaces and
 * classes it is declared in. */
function declarationsOf(text) {
  const found = [];
  const stack = [];
  Object.defineProperty(found, 'scopeAtEnd', { get: () => stack.filter(item => item.name).map(item => item.name) });
  const pattern = /\bnamespace\s+([\w:]+)\s*\{|\b(class|struct)\s+(?:EGT_\w+\s+)?(?:\[\[[^\]]*\]\]\s*)?(\w+)\s*(?:final\s*)?(?::[^;{]*)?\{|\benum\s+(?:class\s+)?(?:EGT_\w+\s+)?(\w+)\s*(?::\s*[\w:]+\s*)?\{|\busing\s+(\w+)\s*=|[{}]/g;
  for (const match of text.matchAll(pattern)) {
    const scope = stack.filter(item => item.name).map(item => item.name);
    if (match[1]) {
      for (const part of match[1].split('::')) {
        if (/^[A-Z]/.test(part)) found.push({ name: part, scope: [...scope] });
        stack.push({ name: part });
        scope.push(part);
      }
      stack.push({ name: null, close: match[1].split('::').length });
    } else if (match[3]) {
      found.push({ name: match[3], scope, nested: stack.some(item => item.isClass) });
      stack.push({ name: match[3], isClass: true });
    } else if (match[4]) {
      found.push({ name: match[4], scope, nested: stack.some(item => item.isClass) });
      stack.push({ name: null });
    } else if (match[5]) {
      found.push({ name: match[5], scope, nested: stack.some(item => item.isClass) });
    } else if (match[0] === '{') {
      stack.push({ name: null });
    } else if (match[0] === '}') {
      const top = stack.pop();
      // a namespace a::b { closes both
      if (top?.close) for (let i = 0; i < top.close; i++) stack.pop();
    }
  }
  return found;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

export class CppIndex {
  constructor(cppRoot, extraRoots = []) {
    this.cppRoot = cppRoot;
    /** name -> [{ include, file }] */
    this.declarations = new Map();
    this.texts = new Map();
    /** alias name -> its definition */
    this.aliases = new Map();
    /** a state's data class -> the interface name C++ gives it (BetManagerNvrams -> IBetManager::Nvrams) */
    this.dataAliases = new Map();
    /** function name -> its parameter list */
    this.functionParams = new Map();
    // the translated headers first: they replace the C++ sources' of the same paths
    const roots = [...extraRoots, ...INCLUDE_ROOTS.map(root => join(cppRoot, root)), join(cppRoot, '../game_core/libs/src')];
    try {
      for (const name of readdirSync(join(cppRoot, 'alpha_family/plugins'))) roots.push(join(cppRoot, 'alpha_family/plugins', name, 'src'));
    } catch { /* no plugins */ }
    const seenIncludes = new Set();
    for (const root of roots) {
      for (const file of headers(root)) {
        const includePath = relative(root, file).replaceAll('\\', '/');
        if (seenIncludes.has(includePath)) continue;
        seenIncludes.add(includePath);
        const text = stripComments(readFileSync(file, 'utf8'));
        const include = relative(root, file).replaceAll('\\', '/');
        this.texts.set(file, text);
        const declared = new Map();
        const nestedNames = new Set();
        for (const { name, scope, nested } of declarationsOf(text)) {
          if (!declared.has(name)) declared.set(name, scope);
          if (nested) nestedNames.add(name);
        }
        for (const match of text.matchAll(/\busing\s+(\w+)\s*=\s*([^;]+);/g)) if (!this.aliases.has(match[1])) this.aliases.set(match[1], match[2].trim());
        for (const match of text.matchAll(/\busing\s+(Nvrams|Statics)\s*=\s*(\w+)\s*;/g)) {
          // the class whose braces hold it, the innermost
          let owner = null;
          for (const open of text.slice(0, match.index).matchAll(/\b(?:class|struct)\s+(?:EGT_\w+\s+)?(\w+)\b[^;{]*\{/g)) {
            const start = open.index + open[0].length - 1;
            if (start + braceBody(text, start).length + 1 > match.index) owner = open[1];
          }
          if (owner && !this.dataAliases.has(match[2])) this.dataAliases.set(match[2], `${owner}::${match[1]}`);
        }
        // functions at namespace level (indented by at most one level): exported helpers, GameCore's
        for (const match of text.matchAll(/\n( {0,4})(?:template\s*<[^>]*>\s*)?(?:EGT_\w+\s+)?(?:inline\s+|constexpr\s+|\[\[nodiscard\]\]\s+)*((?:const\s+)?[\w:]+(?:<[^;{}()]*>)?[\s*&]+)(\w+)\s*\(/g)) {
          const name = match[3];
          // the function's parameters, for the types its arguments take
          const open = match.index + match[0].length - 1;
          let depth = 0;
          let close = open;
          for (; close < text.length; close++) {
            if (text[close] === '(') depth++;
            else if (text[close] === ')' && --depth === 0) break;
          }
          if (!this.functionParams.has(name)) this.functionParams.set(name, text.slice(open + 1, close).replace(/\s+/g, ' ').trim());
          if (/^(if|for|while|switch|return|operator)$/.test(name) || declared.has(name) || /^(class|struct|enum|using|namespace|return|typedef)\b/.test(match[2].trim())) continue;
          declared.set(name, declarationsOf(text.slice(0, match.index)).scopeAtEnd ?? []);
        }
        for (const [name, scope] of declared) {
          if (!this.declarations.has(name)) this.declarations.set(name, []);
          this.declarations.get(name).push({ include, file, scope, nested: nestedNames.has(name) });
        }
      }
    }
  }

  /** A name's declaration: the one in the header named as the hint (the TypeScript module of it), or after the name. */
  Pick(name, hint = null, owners = []) {
    let found = this.declarations.get(name);
    if (!found?.length) return null;
    // the translated file's own plugin first, then the libraries; another game's plugin last
    if (this.preferredPlugin) {
      const rank = item => (item.file.includes(`/alpha_family/plugins/${this.preferredPlugin}/`) ? 0 : item.file.includes('/alpha_family/plugins/') ? 2 : 1);
      found = [...found].sort((a, b) => rank(a) - rank(b));
      if (rank(found[0]) === 2) return found[0];
      found = found.filter(item => rank(item) < 2);
    }
    const base = item => item.include.split('/').pop().replace(/\.h$/, '');
    const owned = owners.length ? found.find(item => owners.some(owner => item.scope.includes(owner))) : null;
    if (owned) return owned;
    return (hint && found.find(item => base(item) === hint)) ?? found.find(item => base(item).split('.')[0] === name.replace(/State$/, '')) ?? found[0];
  }

  /** The header to include for a name. */
  Include(name, hint = null, owners = []) {
    return this.Pick(name, hint, owners)?.include ?? null;
  }

  Has(name) {
    return this.declarations.has(name);
  }

  /** Whether a name is declared outside classes: what a bare name in a signature can be. */
  HasTopLevel(name) {
    return (this.declarations.get(name) ?? []).some(item => !item.nested);
  }

  /** How code in namespace Egt::Game::AlphaFamily (using namespace States) names a declaration: IKnobsView::EKnobsType,
   * ViewTools::BarsSync, Currency. */
  Qualified(name, withStates = false, hint = null, owners = []) {
    const found = this.Pick(name, hint, owners);
    if (!found) return name;
    const visible = withStates ? ['Egt', 'Game', 'AlphaFamily'] : ['Egt', 'Game', 'AlphaFamily', 'States'];
    const scope = [...found.scope];
    while (scope.length && visible.includes(scope[0])) scope.shift();
    return [...scope, name].join('::');
  }

  /** A class's or struct's body, bases and file. */
  Class(name) {
    for (const { file } of this.declarations.get(name) ?? []) {
      const text = this.texts.get(file);
      const match = new RegExp(`\\b(?:class|struct)\\s+(?:EGT_\\w+\\s+)?${name}\\b\\s*(?:final\\s*)?(:[^{;]*)?\\{`).exec(text);
      if (!match) continue;
      const bases = (match[1] ?? '').replace(/^:/, '').split(',').map(base => base.replace(/\b(public|protected|private|virtual)\b/g, '').trim())
        .filter(Boolean).map(base => base.split('::').pop().replace(/<.*$/, ''));
      return { body: braceBody(text, match.index + match[0].length - 1), bases, file };
    }
    return null;
  }

  /** The methods a class and its bases declare: name -> { ret, params, isConst, isVirtual }. */
  Methods(name, seen = new Set()) {
    const methods = new Map();
    if (seen.has(name)) return methods;
    seen.add(name);
    const cls = this.Class(name);
    if (!cls) return methods;
    // the class's own declarations: its body without nested bodies (structs, inline functions), split at ;
    let flat = cls.body;
    for (let previous = ''; previous !== flat;) {
      previous = flat;
      flat = flat.replace(/\{[^{}]*\}/g, ';');
    }
    flat = flat.replace(/\b(public|protected|private)\s*:/g, ';');
    for (const piece of flat.split(';')) {
      const match = /^\s*(virtual\s+)?(?:static\s+)?(?:inline\s+)?([\s\S]+?)\s*\b(\w+)\s*\(([\s\S]*)\)\s*(const)?\s*(?:noexcept)?\s*(?:->\s*([^=]+?))?\s*(override|final)?\s*(=\s*0|=\s*default|=\s*delete)?\s*$/.exec(piece);
      if (!match) continue;
      const [, isVirtualKeyword, declaredRet, method, params, isConst, trailing, overrides] = match;
      const ret = trailing && /^\s*auto\s*$/.test(declaredRet) ? trailing : declaredRet;
      const virtual = isVirtualKeyword || overrides;
      if (['if', 'for', 'while', 'switch', 'return', 'operator'].includes(method) || /\b(operator|using|typedef|struct|class|enum)\b/.test(ret)) continue;
      if (method === name || ret.trim() === '~') continue;
      const cleanRet = ret.replace(/^template\s*<[^>]*>\s*/, '').trim();
      const signature = { ret: cleanRet, params: params.trim(), isConst: !!isConst, isVirtual: !!virtual, isTemplate: /^template\b/.test(ret.trim()),
        isPure: /=\s*0/.test(match[8] ?? '') };
      if (!methods.has(method)) methods.set(method, { ...signature, overloads: [signature] });
      else methods.get(method).overloads.push(signature);
    }
    for (const base of cls.bases) for (const [method, signature] of this.Methods(base, seen)) if (!methods.has(method)) methods.set(method, signature);
    return methods;
  }

  /** Whether a class is abstract (an interface): it declares a pure virtual method. */
  IsAbstract(name) {
    const cls = this.Class(name);
    return !!cls && /\)\s*(const)?\s*(->[^;=]*)?\s*=\s*0\s*;/.test(cls.body);
  }

  /** Whether a class is a class template (ButtonView<Interface>, NumericBarView<Interface>). */
  IsTemplate(name) {
    const cls = this.Class(name);
    if (!cls) return false;
    const text = this.texts.get(cls.file);
    const match = new RegExp(`template\\s*<[^>]*>\\s*(?:class|struct)\\s+(?:EGT_\\w+\\s+)?${name}\\b`).exec(text);
    return !!match;
  }

  /** A class's constructors' parameter lists. */
  Constructors(name) {
    const cls = this.Class(name);
    if (!cls) return [];
    let flat = cls.body;
    for (let previous = ''; previous !== flat;) {
      previous = flat;
      flat = flat.replace(/\{[^{}]*\}/g, ';');
    }
    flat = flat.replace(/\b(public|protected|private)\s*:/g, ';').replace(/\)\s*:[^;]*;/g, ');');
    const found = [];
    for (const piece of flat.split(';')) {
      const match = new RegExp(`^\\s*(?:explicit\\s+)?${name}\\s*\\(([\\s\\S]*)\\)\\s*(=\\s*\\w+)?\\s*$`).exec(piece);
      if (match && !match[2]) found.push(match[1].trim());
    }
    return found;
  }

  /** The events a class's Events struct (or its bases') declares: name -> argument types. */
  Events(name, seen = new Set()) {
    const events = new Map();
    if (seen.has(name)) return events;
    seen.add(name);
    const cls = this.Class(name);
    if (!cls) return events;
    const match = /struct\s+(?:EGT_\w+\s+)?Events\b\s*(:[^{]*)?\{/.exec(cls.body);
    if (match) {
      const body = braceBody(cls.body, match.index + match[0].length - 1);
      for (const event of body.matchAll(/Core::Event<([^;]*)>\s+(\w+)\s*;/g)) events.set(event[2], event[1].trim());
      const bases = (match[1] ?? '').replace(/^:/, '').split(',').map(base => base.replace(/\bpublic\b/, '').trim()).filter(Boolean);
      for (const base of bases) {
        const owner = base.split('::').slice(-2, -1)[0];
        if (owner) for (const [event, args] of this.Events(owner, seen)) if (!events.has(event)) events.set(event, args);
      }
    }
    for (const base of cls.bases) for (const [event, args] of this.Events(base, seen)) if (!events.has(event)) events.set(event, args);
    return events;
  }

  /** Whether a name is an alias of a std::variant (RoundInput, RoundPhase). */
  IsVariantAlias(name) {
    return /^std::variant</.test(this.aliases.get(name) ?? '');
  }

  /** Whether a struct can take a designated initializer: no bases and no constructors. */
  IsAggregate(name) {
    const cls = this.Class(name);
    if (!cls) return false;
    return !cls.bases.length && !new RegExp(`\\b${name}\\s*\\(`).test(cls.body);
  }

  /** A field's C++ type in a class or its bases, or null. */
  FieldType(name, field, seen = new Set()) {
    if (seen.has(name)) return null;
    seen.add(name);
    const cls = this.Class(name);
    if (!cls) return null;
    let flat = cls.body;
    for (let previous = ''; previous !== flat;) {
      previous = flat;
      flat = flat.replace(/\{[^{}]*\}/g, ';');
    }
    const match = new RegExp(`(?:^|[;:])\\s*((?:const\\s+)?[\\w:<>,\\s*&]+?)\\s+${field}\\s*(?:=[^;]*)?;`).exec(flat.replace(/\b(public|protected|private)\s*:/g, ';'));
    if (match) return match[1].trim();
    for (const base of cls.bases) {
      const type = this.FieldType(base, field, seen);
      if (type) return type;
    }
    return null;
  }

  /** A struct's fields in their declaration order, for designated initializers. */
  Fields(name) {
    const cls = this.Class(name);
    if (!cls) return [];
    const body = cls.body.replace(/\b(?:struct|class)\s+\w+[^{;]*\{[\s\S]*?\};/g, '');
    return [...body.matchAll(/^\s*(?:const\s+)?[\w:<>,\s*&]+?\s+(\w+)\s*(?:=[^;]*|\{[^;]*\})?;/gm)].map(match => match[1])
      .filter(field => !['return', 'using', 'public', 'private'].includes(field));
  }
}
