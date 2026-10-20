// Translates the browser game's TypeScript classes into the C++ of the games repository: a state of a state machine
// (extends State) or a view (extends BaseView, ButtonView, NumericBarView...) into its .h and .cpp, in the C++ states'
// and views' own form.
//
// The TypeScript mirrors the C++ API, so most of it maps one to one: this.Parent(IX) is Parent<IX>(), this.Transit(IX)
// is Transit<IX>(), IX.Events is IX::Events, RoundType.Main is RoundType::Main. What differs is lowered: an object
// literal becomes a designated initializer in the C++ struct's field order, optional chaining an if or a conditional,
// x! on an optional .value() and on a pointer *x, Object.assign assignments, array methods <algorithm>. The C++ index
// (CppIndex.mjs) gives each name its header, each interface method its exact signature (to override it), and each event
// its argument types (for its handler). What the translator cannot express is an error with its line: the class is then
// not translated, rather than translated wrong.

import ts from 'typescript';

const TOKEN_METHODS = new Set([
  'RuntimeGet', 'RuntimeGetConst', 'RuntimeTryGet', 'RuntimeTryGetConst', 'Parent', 'ConstParent', 'HasParent', 'Nvram', 'ConstNvram',
  'Static', 'ConstStatic', 'Transit', 'TransitLater', 'RuntimeRemove',
]);
const POINTER_METHODS = new Set(['RuntimeTryGet', 'RuntimeTryGetConst']);
const REFERENCE_METHODS = new Map([
  ['Nvram', ''], ['ConstNvram', 'const '], ['Static', ''], ['ConstStatic', 'const '], ['Parent', ''], ['ConstParent', 'const '],
  ['RuntimeGet', ''], ['RuntimeGetConst', 'const '],
]);
const STATE_METHODS = new Map([['OnTransit', { ret: 'void', params: 'bool isStartup, bool isRecovery', isConst: false, isVirtual: true }]]);
const I = '    ';
const PRIMITIVE_ALIASES = new Set(['int', 'unsigned', 'int32_t', 'int64_t', 'uint32_t', 'uint64_t', 'size_t', 'float', 'double']);
/** Functions of the browser game whose C++ is an expression. */
const FUNCTIONS = {
  RandomDevice: { cpp: () => 'std::random_device()()', include: 'random' },
  // the C++ options structs have their defaults in their fields
  WithDefaults: { cpp: ([options]) => options, include: null },
  String: { cpp: ([value]) => `std::to_string(${value})`, include: 'string' },
};

/** Methods of the browser game's types whose C++ is an operator or a copy. */
const OPERATOR_METHODS = {
  Currencies: {
    AddAll: (base, [other]) => `${base} += ${other}`, SubtractAll: (base, [other]) => `${base} -= ${other}`,
    Plus: (base, [other]) => `(${base} + ${other})`, Minus: (base, [other]) => `(${base} - ${other})`, Clone: base => `Currencies(${base})`,
    empty: base => `${base}.data.empty()`,
  },
  PayoutSummary: { Clone: base => `PayoutSummary(${base})`, AddSummary: (base, [other]) => `${base} += ${other}` },
  // the browser's Stopwatch measures in ms, C++'s in Clock::duration
  Stopwatch: { Measure: base => `std::chrono::duration_cast<std::chrono::milliseconds>(${base}.Measure()).count()` },
};

/** The browser game's tweens (engine/GameCore/Tools/Tweeny.ts) are tweeny's: functions and methods of a tween_action. */
const TWEENY_FUNCTIONS = { Delay: 'tweeny::delay', Together: 'tweeny::together', Sequence: 'tweeny::sequence' };
const TWEEN_METHODS = {
  OnBegin: (base, [handler]) => `${base}.on_begin.connect(${handler})`,
  OnEnd: (base, [handler]) => `${base}.on_end.connect(${handler})`,
  Start: (base, _args, scope) => `tweeny::start(${base}, {${JSON.stringify(scope)}})`,
  Stop: base => `tweeny::stop(${base})`,
  StopAndFinish: base => `tweeny::stop_and_finish(${base})`,
  IsRunning: base => `tweeny::is_running(${base})`,
  // tweeny's manager updates the tweens
  Process: null,
};
/** The browser game's geometry types, video_ctrl's: their C++ type and their fields in constructor order. */
const VIDEO_TYPES = {
  Point: { cpp: 'video_ctrl::pointf', fields: ['x', 'y'], cast: 'float' },
  Position: { cpp: 'video_ctrl::pointf', fields: ['x', 'y'], cast: 'float' },
  Size: { cpp: 'video_ctrl::size', fields: ['w', 'h'], cast: 'int' },
  RssRect: { cpp: 'video_ctrl::rect', fields: ['x', 'y', 'w', 'h'], cast: 'int' },
  Rect: { cpp: 'video_ctrl::rect', fields: ['x', 'y', 'w', 'h'], cast: 'int' },
  Color: { cpp: 'video_ctrl::color', fields: ['r', 'g', 'b', 'a'], cast: 'uint8_t' },
};

/** A C++ parameter that takes a duration: the TypeScript's milliseconds. */
const DURATION_TYPE = /\b(duration_t|duration|milliseconds)\b/;

class TranslationError extends Error {}

/** A C++ parameter list's types and names. */
function cppParams(params) {
  const list = [];
  let depth = 0;
  let current = '';
  for (const char of params) {
    if ('<(['.includes(char)) depth++;
    if ('>)]'.includes(char)) depth--;
    if (char === ',' && depth === 0) {
      list.push(current);
      current = '';
    } else current += char;
  }
  if (current.trim()) list.push(current);
  return list.map(param => {
    const text = param.replace(/=.*$/, '').trim();
    const match = /^(.*?[\s*&>])(\w+)$/.exec(text);
    if (match && match[1].trim() && !/^(const|unsigned|signed)$/.test(match[1].trim())) return { type: match[1].trim(), name: match[2] };
    return { type: text, name: null };
  });
}

export class Translator {
  constructor(program, index) {
    this.program = program;
    this.checker = program.getTypeChecker();
    this.index = index;
  }

  // Classes -------------------------------------------------------------------------------------------------------

  /** The C++ of a TypeScript file's state or view class: { header, source, name } or throws a TranslationError. */
  TranslateState(sourceFile) {
    const declaration = sourceFile.statements.find(statement => ts.isClassDeclaration(statement) && statement.heritageClauses);
    if (!declaration) throw new TranslationError(`${sourceFile.fileName}: no class`);
    this.sourceFile = sourceFile;
    this.className = declaration.name.text;
    this.kind = this.ClassKind(declaration);
    this.index.preferredPlugin = /alpha_family\/plugins\/([^/]+)\//.exec(this.TsPath(sourceFile))?.[1] ?? null;
    if (!this.kind) throw new TranslationError(`${this.TsPath(sourceFile)}: ${this.className} is not a state, a view or a visual (only those are translated)`);
    this.includes = new Set();
    this.headerIncludes = new Set(this.kind === 'state' ? ['Egt/Fsm/State.h'] : []);
    // the file's interfaces C++ does not declare, or declares inside the class the translation replaces
    const ownNested = name => (this.index.declarations.get(name) ?? []).every(item => item.scope.includes(this.className));
    this.localStructs = new Map(sourceFile.statements.filter(statement => ts.isInterfaceDeclaration(statement) && (!this.index.Has(statement.name.text) || ownNested(statement.name.text)))
      .map(statement => [statement.name.text, statement.members.filter(item => ts.isPropertySignature(item)).map(item => item.name.getText())]));
    this.localEnums = new Set(sourceFile.statements.filter(statement => ts.isEnumDeclaration(statement)).map(statement => statement.name.text));
    this.errors = [];
    this.pointers = new Set();
    this.optionals = new Set();
    this.getters = new Map();
    this.handlers = new Map();
    this.renames = new Map();
    this.tokenRenames = new Map();
    this.elements = new Map();
    this.pointerMethods = new Set();
    this.pointerFields = new Set();
    this.fieldTypes = new Map();
    this.importedFunctions = new Map();

    const base = declaration.heritageClauses.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0].expression.getText();
    const isAbstract = declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AbstractKeyword);
    const statics = { Interfaces: [], Nvrams: [], Statics: [] };
    const members = [];
    for (const member of declaration.members) {
      const isStatic = member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword);
      if (isStatic && ts.isPropertyDeclaration(member) && member.name.text in statics && ts.isArrayLiteralExpression(member.initializer)) {
        statics[member.name.text] = member.initializer.elements.map(element => element.getText());
        continue;
      }
      members.push(member);
    }
    // the interfaces' methods, which the class overrides with their signatures
    const interfaceMethods = new Map(this.kind === 'state' ? STATE_METHODS : []);
    // a class the C++ already has: its own declarations, which the TypeScript cannot say (references, const, int)
    this.ownMethods = this.index.Methods(this.className);
    this.baseName = base;
    const view = this.kind === 'view' || this.kind === 'visual' ? this.ViewBases(declaration, members) : null;
    const bases = view ? view.bases : [base === 'State' ? 'Fsm::State' : base];
    if (view) for (const [method, signature] of view.methods) if (!interfaceMethods.has(method)) interfaceMethods.set(method, signature);
    if (base !== 'State') this.UseHeader(base, true);
    const inherited = this.InheritedInterfaces(declaration);
    this.inheritedEvents = new Set();
    for (const name of statics.Interfaces) {
      const events = /^(\w+)\.Events$/.exec(name);
      if (events) {
        // the interface's events, which the class posts: its C++ derives from them
        if (!inherited.has(name)) bases.push(`States::${events[1]}::Events`);
        this.UseHeader(events[1], true);
        for (const event of this.index.Events(events[1]).keys()) this.inheritedEvents.add(event);
        continue;
      }
      if (!inherited.has(name)) bases.push(`States::${name}`);
      this.UseHeader(name, true);
      for (const [method, signature] of this.index.Methods(name)) if (signature.isVirtual && !interfaceMethods.has(method)) interfaceMethods.set(method, signature);
    }
    statics.Interfaces = statics.Interfaces.map(name => name.replace('.Events', '::Events'));
    // the classes whose nested names a signature's bare names are: the class's and its interfaces'
    this.ownerScopes = [this.className, ...statics.Interfaces.map(name => name.replace('::Events', '')), ...this.index.Class(this.className)?.bases ?? [],
      ...(view?.scopes ?? [])];
    if (base !== 'State') for (const [method, signature] of this.index.Methods(base)) if (signature.isVirtual && !interfaceMethods.has(method)) interfaceMethods.set(method, signature);
    for (const data of [...statics.Nvrams, ...statics.Statics]) this.UseHeader(data, true);

    // event handlers: the methods ReactOn passes, with their events' argument types
    this.FindHandlers(declaration);
    // the fields the class registers as an interface's events: their C++ type is IX::Events
    this.eventsFields = new Map();
    const findEvents = node => {
      if (ts.isCallExpression(node) && this.IsThisCall(node, 'RuntimeAdd') && node.arguments.length === 2) {
        const [token, value] = node.arguments;
        if (ts.isPropertyAccessExpression(token) && token.name.text === 'Events' && ts.isPropertyAccessExpression(value) && value.expression.kind === ts.SyntaxKind.ThisKeyword) {
          this.eventsFields.set(value.name.text, this.OriginalName(token.expression));
        }
      }
      ts.forEachChild(node, findEvents);
    };
    findEvents(declaration);
    for (const member of members) {
      if (ts.isGetAccessorDeclaration(member)) this.getters.set(member.name.text, member);
    }

    const declarations = { public: [], protected: [], private: [] };
    const definitions = [];
    const getterDefinitions = [];
    this.FindPointerMethods(members);
    for (const member of members) {
      // what only the browser game has (a member whose doc comment says @browserOnly)
      if (ts.getJSDocTags(member).some(tag => tag.tagName.text === 'browserOnly')) continue;
      // what a C++ base the view derives from already defines (BaseReelsView::GetReelsViewConfig)
      if (ts.isMethodDeclaration(member) && (this.extraBases ?? []).some(base => {
        const method = this.index.Methods(base).get(member.name.getText());
        return method && !method.isVirtual && !method.overloads?.some(item => item.isVirtual);
      })) continue;
      try {
        const overloads = ts.isMethodDeclaration(member) ? this.Overloads(member, interfaceMethods) : null;
        if (overloads) {
          for (const overload of overloads) {
            declarations[overload.access].push(overload.declaration);
            definitions.push(overload.definition);
          }
        } else if (ts.isGetAccessorDeclaration(member)) {
          // a getter, and its const overload for const methods
          for (const forceConst of [false, true]) {
            this.forceConst = forceConst;
            const { declaration: decl, definition, access } = this.Method(member, interfaceMethods);
            declarations[access].push(decl);
            getterDefinitions.push(definition);
          }
          this.forceConst = false;
        } else if (ts.isMethodDeclaration(member)) {
          const { declaration: decl, definition, access } = this.Method(member, interfaceMethods);
          declarations[access].push(decl);
          if (definition) definitions.push(definition);
        } else if (ts.isPropertyDeclaration(member)) {
          if (this.inheritedEvents.has(member.name.getText()) && member.initializer && ts.isNewExpression(member.initializer)) continue;
          declarations[this.Access(member)].push(this.Field(member));
        } else if (ts.isConstructorDeclaration(member)) {
          if (this.kind === 'state') this.Fail(member, 'a state has no constructor in C++');
          const { declaration: decl, definition } = this.Constructor(member, view);
          declarations.public.unshift(decl);
          definitions.unshift(definition);
          for (const field of this.propertyFields) declarations[field.access].push(field.declaration);
        } else {
          this.Fail(member, `unsupported member ${ts.SyntaxKind[member.kind]}`);
        }
      } catch (error) {
        if (!(error instanceof TranslationError)) throw error;
        this.errors.push(error.message);
      }
    }
    if (view) {
      // an interface's methods the TypeScript class inherits from its TypeScript base: the C++ base's, which C++ overrides
      const declared = new Set(members.filter(member => member.name).map(member => member.name.getText()));
      const baseMethods = this.index.Methods(this.baseCpp);
      for (const [method, signature] of view.methods) {
        if (declared.has(method) || !signature.isPure) continue;
        const own = baseMethods.get(method);
        if (!own || own.isPure) continue;
        const list = cppParams(signature.params).map((param, i) => ({ type: this.QualifyCppType(param.type), name: param.name ?? `arg${i}` }));
        const ret = this.QualifyCppType(signature.ret);
        const call = `${this.baseCpp}::${method}(${list.map(param => (/^std::string$/.test(param.type) ? `std::move(${param.name})` : param.name)).join(', ')})`;
        declarations.public.push(`${ret} ${method}(${list.map(param => `${param.type} ${param.name}`).join(', ')})${signature.isConst ? ' const' : ''} override;`);
        definitions.push(`${I}${ret} ${this.className}::${method}(${list.map(param => `${param.type} ${param.name}`).join(', ')})${signature.isConst ? ' const' : ''}\n${I}{\n${I}${I}${ret === 'void' ? '' : 'return '}${call};\n${I}}`);
      }
    }
    if (view && !members.some(member => ts.isConstructorDeclaration(member))) {
      try {
        this.propertyFields = [];
        const { declaration: decl, definition } = this.Constructor(null, view);
        declarations.public.unshift(decl);
        definitions.unshift(definition);
      } catch (error) {
        if (!(error instanceof TranslationError)) throw error;
        this.errors.push(error.message);
      }
    }
    if (this.errors.length) throw new TranslationError(this.errors.join('\n'));

    // the module's interfaces C++ does not declare: structs before the class
    const structs = [];
    for (const statement of sourceFile.statements) {
      if (!ts.isInterfaceDeclaration(statement) || !this.localStructs.has(statement.name.text)) continue;
      try {
        const fields = statement.members.filter(item => ts.isPropertySignature(item)).map(item => {
          const type = item.type ? this.CppTypeNode(item.type) : null;
          if (!type) this.Fail(item, 'a field of no C++ type');
          const optional = item.questionToken && !/^(std::optional<|Ptr<)|\*$/.test(type) ? `std::optional<${type}>` : type;
          return `${I}${I}${optional} ${item.name.getText()}{};`;
        });
        structs.push(`struct ${statement.name.text}\n${I}${I}{\n${fields.map(field => `${I}${field}`).join('\n')}\n${I}${I}};`);
      } catch (error) {
        if (!(error instanceof TranslationError)) throw error;
        this.errors.push(error.message);
      }
    }
    for (const struct of structs.reverse()) declarations.public.unshift(struct);
    // the module's enums: nested in the class, as C++ declares a view's own enums
    for (const statement of sourceFile.statements) {
      if (!ts.isEnumDeclaration(statement)) continue;
      const items = statement.members.map(item => `${I}${item.name.getText()}${item.initializer ? ` = ${this.Expr(item.initializer)}` : ''},`);
      declarations.public.unshift(`enum class ${statement.name.text}\n${I}${I}{\n${items.map(item => `${I}${I}${item}`).join('\n')}\n${I}${I}};`);
    }
    const list = names => names.join(', ');
    const head = [];
    if (statics.Interfaces.length) head.push(`using Interfaces = Fsm::List<${list(statics.Interfaces)}>;`);
    if (statics.Nvrams.length) head.push(`using Nvrams = Fsm::List<${list(statics.Nvrams)}>;`);
    if (statics.Statics.length) head.push(`using Statics = Fsm::List<${list(statics.Statics)}>;`);
    const section = (name, lines) => (lines.length ? `\n${I}${name}:\n${lines.map(line => `${I}${I}${line}`).join('\n')}\n` : '');
    // the module's functions: the .cpp's own, in an anonymous namespace
    const functions = [];
    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement)) {
        try {
          functions.push(...statement.declarationList.declarations.map(item => this.ModuleConstant(item)));
        } catch (error) {
          if (!(error instanceof TranslationError)) throw error;
          this.errors.push(error.message);
        }
        continue;
      }
      if (!ts.isFunctionDeclaration(statement) || !statement.body || FUNCTIONS[statement.name.text]) continue;
      try {
        functions.push(this.Function(statement));
      } catch (error) {
        if (!(error instanceof TranslationError)) throw error;
        this.errors.push(error.message);
      }
    }
    for (const translated of this.importedFunctions.values()) if (translated) functions.unshift(translated);
    if (this.errors.length) throw new TranslationError(this.errors.join('\n'));
    const tsPath = this.TsPath(sourceFile);
    const header = `#pragma once

// Translated by the browser game from frontend/src/game/${tsPath}.

${[...this.headerIncludes].sort().map(path => `#include <${path}>`).join('\n')}

namespace Egt::Game::AlphaFamily
{
    class ${this.className}${isAbstract ? '' : ' final'}
        : ${bases.map((item, i) => `${i ? '        , ' : ''}public ${item}`).join('\n')}
    {
    public:
${head.map(line => `${I}${I}${line}`).join('\n')}${head.length ? '\n' : ''}${section('public', declarations.public).replace(/^\n {4}public:\n/, '')}${section('protected', declarations.protected)}${section('private', declarations.private)}    };
}
`.replace(/\n{3,}/g, '\n\n');
    for (const include of this.headerIncludes) this.includes.delete(include);
    const source = `// Translated by the browser game from frontend/src/game/${tsPath}.
#include "${this.FileName(sourceFile)}.h"

${[...this.includes].sort().map(path => `#include <${path}>`).join('\n')}

namespace Egt::Game::AlphaFamily
{
${this.kind === 'state' ? `${I}using namespace States;\n${I}using Reaction = Fsm::State::Reaction;\n` : ''}${functions.length ? `\n${I}namespace\n${I}{\n${functions.join('\n')}\n${I}}\n` : ''}
${[...getterDefinitions, ...definitions].join('\n\n')}
}
`.replace(/\n{3,}/g, '\n\n');
    return { name: this.className, file: this.FileName(sourceFile), header, source };
  }

  /** The interfaces the TypeScript base classes list (static Interfaces), which the C++ base classes derive from. */
  InheritedInterfaces(declaration) {
    const names = new Set();
    let current = declaration;
    for (;;) {
      const heritage = current.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0].expression;
      if (!heritage) break;
      let symbol = this.checker.getSymbolAtLocation(heritage);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
      const base = symbol?.valueDeclaration;
      if (!base || !ts.isClassDeclaration(base)) break;
      for (const member of base.members) {
        if (ts.isPropertyDeclaration(member) && member.name.getText() === 'Interfaces' && member.initializer && ts.isArrayLiteralExpression(member.initializer)) {
          for (const element of member.initializer.elements) names.add(element.getText());
        }
      }
      current = base;
    }
    return names;
  }

  /** Whether an expression is used as a value: not as a condition, nor as the object of a member. */
  IsValueUse(node) {
    const parent = node.parent;
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node) return false;
    if (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) return false;
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind)) return false;
    if ((ts.isIfStatement(parent) || ts.isWhileStatement(parent)) && parent.expression === node) return false;
    if (ts.isConditionalExpression(parent) && parent.condition === node) return false;
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind)) return false;
    return true;
  }

  /** A truthiness test the C++ needs spelled out: an element read from an array (whether its index is valid), an
   * object TypeScript cannot have null (true). */
  Truthiness(node, chain) {
    if (ts.isIdentifier(node)) {
      const element = this.elements.get(this.checker.getSymbolAtLocation(node));
      if (element) {
        this.UseHeader('IsValidIndex');
        return `GameCore::IsValidIndex(${this.Expr(element.expression, chain)}, ${this.Expr(element.argumentExpression, chain)})`;
      }
    }
    if (this.IsAlwaysTruthy(node)) return 'true';
    // a string: whether it is not empty
    const type = this.checker.getTypeAtLocation(node);
    if (this.IsTweenType(type)) return `${this.Expr(node, chain)}.is_valid()`;
    if (this.checker.getNonNullableType(type).flags & ts.TypeFlags.StringLike && !this.IsOptional(node) && !this.IsPointer(node)) return `!${this.Expr(node, chain)}.empty()`;
    return null;
  }

  /** Whether a TypeScript truthiness test is of an object that cannot be null: always true. */
  IsAlwaysTruthy(node) {
    const type = this.checker.getTypeAtLocation(node);
    if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined) || type.isUnion()) return false;
    if (this.IsPointer(node) || this.IsOptional(node)) return false;
    return !!(type.flags & ts.TypeFlags.Object) && !this.checker.isArrayType(type) && !(type.getCallSignatures().length);
  }

  /** Whether an optional's use has a value: TypeScript narrowed out null, and it is not assigned to. */
  IsNarrowedValue(node) {
    const parent = node.parent;
    if (ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return false;
    if (ts.isNonNullExpression(parent)) return false;
    const type = this.checker.getTypeAtLocation(node);
    return !(type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) && !(type.isUnion() && type.types.some(item => item.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)));
  }

  TsPath(sourceFile) {
    return sourceFile.fileName.replace(/^.*?\/src\/game\//, '');
  }

  FileName(sourceFile) {
    return sourceFile.fileName.split('/').pop().replace(/\.ts$/, '');
  }

  Fail(node, message) {
    const { line } = this.sourceFile.getLineAndCharacterOfPosition(node.getStart());
    throw new TranslationError(`${this.TsPath(this.sourceFile)}:${line + 1}: ${message}: ${node.getText().split('\n')[0].slice(0, 100)}`);
  }

  /** A C++ name, qualified as code in Egt::Game::AlphaFamily names it, with its header used. */
  Name(name, inHeader = false, hint = null) {
    // the TypeScript's IXEvents is C++'s IX::Events
    const events = /^(I\w+)Events$/.exec(name);
    if (events && !this.index.Has(name) && this.index.Has(events[1])) return `${this.Name(events[1], inHeader, hint)}::Events`;
    this.UseHeader(name, inHeader, hint);
    // a header has no using namespace States: what States declares is qualified there
    return this.index.Qualified(name, inHeader, hint);
  }

  /** Whether a TypeScript type is a tween (Tweeny.ts's TweenAction and its kinds): tweeny::tween_action. */
  IsTweenType(type) {
    const nonNull = this.checker.getNonNullableType(type);
    const declaration = nonNull.symbol?.declarations?.[0];
    return !!declaration && /\/Tools\/Tweeny\.ts$/.test(declaration.getSourceFile().fileName) && (nonNull.symbol.flags & ts.SymbolFlags.Class) !== 0;
  }

  /** Whether a TypeScript type is a view element's class (BaseElement and its kinds): the elements list owns them, and
   * C++ holds them by pointer. */
  IsElementType(type) {
    let symbol = this.checker.getNonNullableType(type).symbol;
    for (let depth = 0; symbol && depth < 8; depth++) {
      if (symbol.name === 'BaseElement') return true;
      const declaration = symbol.declarations?.find(item => ts.isClassDeclaration(item));
      const heritage = declaration?.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0].expression;
      if (!heritage) return false;
      symbol = this.checker.getSymbolAtLocation(heritage);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
    }
    return false;
  }

  /** Whether a TypeScript type is a view's visual (BaseVisual and its kinds): C++ views hold them by Ptr<T>. */
  IsVisualType(type) {
    let symbol = this.checker.getNonNullableType(type).symbol;
    for (let depth = 0; symbol && depth < 8; depth++) {
      if (symbol.name === 'BaseVisual') return true;
      const declaration = symbol.declarations?.find(item => ts.isClassDeclaration(item));
      const heritage = declaration?.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0].expression;
      if (!heritage) return false;
      symbol = this.checker.getSymbolAtLocation(heritage);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
    }
    return false;
  }

  IsTweenName(name) {
    return name === 'TweenAction';
  }

  /** A TypeScript function imported from a file of the browser game's engine: Tweeny.ts's Delay... */
  ImportedFrom(identifier, pattern) {
    let symbol = this.checker.getSymbolAtLocation(identifier);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
    const file = symbol?.declarations?.[0]?.getSourceFile().fileName ?? '';
    return pattern.test(file);
  }

  /** The arguments of a C++ function or method: a duration parameter takes the TypeScript's milliseconds. */
  CoerceArgs(args, nodes, params) {
    const list = cppParams(params ?? '');
    return args.map((arg, i) => {
      const node = nodes[i];
      // a C++ string_view (BaseElement::GetId()) where a string is taken
      if (node && /^std::string_view$/.test(this.CppReturnOf(node) ?? '') && !/string_view/.test(list[i]?.type ?? '')) return `std::string(${arg})`;
      // a pointer where C++ takes a pointer (ElementPtr, Ptr<T>, T*): the pointer, not its object
      if (node && /(Ptr|_ptr)\b|\*\s*$/.test(list[i]?.type ?? '')) {
        let inner = node;
        while (ts.isNonNullExpression(inner) || ts.isParenthesizedExpression(inner)) inner = inner.expression;
        if (this.IsPointer(inner)) return ts.isIdentifier(inner) ? (this.renames.get(this.checker.getSymbolAtLocation(inner)) ?? inner.text) : this.Expr(inner);
      }
      if (node && DURATION_TYPE.test(list[i]?.type ?? '') && this.checker.getTypeAtLocation(node).flags & ts.TypeFlags.NumberLike) {
        this.includes.add('chrono');
        return `std::chrono::milliseconds(${arg})`;
      }
      // a point where C++ takes the int kind (HandleTouchDown(const video_ctrl::point&))
      if (node && /\bvideo_ctrl::point\b|^(const\s+)?point\b/.test(list[i]?.type ?? '') && !ts.isObjectLiteralExpression(node)
        && ['Point', 'Position'].includes(this.checker.getTypeAtLocation(node).aliasSymbol?.name ?? this.checker.getTypeAtLocation(node).symbol?.name)) {
        return `[&](auto&& point_) { return video_ctrl::point(int(point_.x), int(point_.y)); }(${arg})`;
      }
      // an enum where C++ takes its integer
      const argType = node ? this.checker.getTypeAtLocation(node) : null;
      const isEnum = argType && ((argType.flags & ts.TypeFlags.EnumLike) || (argType.isUnion() && argType.types.every(item => item.flags & ts.TypeFlags.EnumLiteral)));
      if (isEnum && /^(const\s+)?(int|int64_t|int32_t|uint32_t|size_t|unsigned)\b/.test(list[i]?.type ?? '')) return `int(${arg})`;
      return arg;
    });
  }

  /** Whether a name is a TypeScript IXEvents class, C++'s IX::Events. */
  IsEventsName(name) {
    const events = /^(I\w+)Events$/.exec(name);
    return !!events && !this.index.Has(name) && this.index.Has(events[1]);
  }

  /** A type as a C++ header writes it: its unqualified names qualified (States::TetraViewOptions,
   * ILocalization::LanguageCode), as a class declaration outside the interface sees them. */
  QualifyCppType(text) {
    return text.replace(/(::\s*)?\b([A-Z]\w*)\b(\s*<)?/g, (match, scope, id, template) => {
      if (scope || !this.index.Has(id) || (template && !this.index.HasTopLevel(id))) return match;
      const owners = this.ownerScopes ?? [];
      const qualified = this.index.Qualified(id, true, null, owners);
      if (qualified !== id) {
        const include = this.index.Include(id, null, owners);
        if (include) this.headerIncludes.add(include);
      }
      return qualified + (template ?? '');
    });
  }

  /** The TypeScript module a name is declared in, as the C++ header base it mirrors: IInfoView.bridge. */
  ModuleHint(identifier) {
    let symbol = this.checker.getSymbolAtLocation(identifier);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
    const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
    return file ? file.split('/').pop().replace(/\.ts$/, '') : null;
  }

  UseHeader(name, inHeader = false, hint = null) {
    const include = this.index.Include(name, hint);
    if (!include) return false;
    (inHeader ? this.headerIncludes : this.includes).add(include);
    return true;
  }

  Access(member) {
    if (member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword)) return 'private';
    if (member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected';
    return 'public';
  }

  /** Methods that return `x instanceof T ? x : null`: in C++ they return std::get_if<T>(&x), a pointer. */
  FindPointerMethods(members) {
    this.pointerMethods = new Map();
    for (const member of members) {
      if (!ts.isMethodDeclaration(member) || !member.body) continue;
      const statement = member.body.statements[member.body.statements.length - 1] ?? null;
      const value = statement && ts.isReturnStatement(statement) ? statement.expression : null;
      const match = value && this.InstanceOfChoice(value);
      if (match) this.pointerMethods.set(member.name.getText(), `const ${this.Name(match.type, true)}*`);
    }
  }

  /** `x instanceof T ? x : null` */
  InstanceOfChoice(node) {
    if (!ts.isConditionalExpression(node) || node.whenFalse.kind !== ts.SyntaxKind.NullKeyword) return null;
    const condition = node.condition;
    if (!ts.isBinaryExpression(condition) || condition.operatorToken.kind !== ts.SyntaxKind.InstanceOfKeyword) return null;
    if (condition.left.getText() !== node.whenTrue.getText()) return null;
    return { value: condition.left, type: condition.right.getText() };
  }

  FindHandlers(declaration) {
    const visit = node => {
      if (ts.isCallExpression(node) && this.IsThisCall(node, 'ReactOn') && node.arguments.length === 2) {
        const [event, handler] = node.arguments;
        if (ts.isPropertyAccessExpression(handler) && handler.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isPropertyAccessExpression(event)) {
          const owner = this.EventsOwner(event.expression);
          const args = owner ? this.index.Events(owner).get(event.name.text) : undefined;
          if (args !== undefined) this.handlers.set(handler.name.text, args);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(declaration);
  }

  /** The interface whose Events an expression is: this.RuntimeGetConst(IX.Events), this.Parent(IX.Events)... */
  EventsOwner(expression) {
    let node = expression;
    while (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const token = node.arguments[0];
      if (ts.isPropertyAccessExpression(token) && token.name.text === 'Events') return token.expression.getText();
    }
    if (ts.isIdentifier(node)) {
      const declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) return this.EventsOwner(declaration.initializer);
    }
    return null;
  }

  IsThisCall(node, name) {
    return ts.isPropertyAccessExpression(node.expression) && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword && node.expression.name.text === name;
  }

  Field(member) {
    const events = this.eventsFields?.get(member.name.getText());
    if (events) return `${this.Name(events, true)}::Events ${member.name.getText()};`;
    const ownType = this.index.Class(this.className) ? this.index.FieldType(this.className, member.name.getText()) : null;
    // the C++ class's own field type, where it is the TypeScript's with another integer width or pointer kind
    let derived = null;
    try {
      const init = member.initializer;
      const typeArgs = !member.type && init && ts.isNewExpression(init) && ['Map', 'Set'].includes(init.expression.getText())
        ? (init.typeArguments ?? []).map(arg => this.CppTypeNode(arg)) : [];
      if (typeArgs.length && typeArgs.every(Boolean)) derived = init.expression.getText() === 'Map' ? `std::map<${typeArgs[0]}, ${typeArgs[1]}>` : `std::set<${typeArgs[0]}>`;
      else derived = this.DeclaredType(member);
    } catch (error) {
      if (!(error instanceof TranslationError)) throw error;
    }
    const useOwn = ownType && !/\b(const|static)\b/.test(ownType) && (!derived || this.SameType(this.QualifyCppType(ownType), derived));
    this.fieldTypes.set(member.name.getText(), useOwn ? this.QualifyCppType(ownType) : derived ?? '');
    if (useOwn) for (const id of ownType.match(/[A-Za-z_]\w*/g) ?? []) if (/^[A-Z]/.test(id) && this.index.HasTopLevel(id)) this.UseHeader(id, true);
    const cppType = useOwn ? this.QualifyCppType(ownType) : derived ?? this.DeclaredType(member);
    const isPointer = /^(Ptr|std::shared_ptr)<|\*$/.test(cppType);
    if (isPointer) this.pointerFields.add(member.name.getText());
    const isNull = member.initializer?.kind === ts.SyntaxKind.NullKeyword || (member.initializer && ts.isIdentifier(member.initializer) && member.initializer.text === 'undefined');
    if (isNull && (isPointer || /^std::optional</.test(cppType) || cppType === 'tweeny::tween_action')) return `${cppType} ${member.name.text};`;
    // the header does not see the .cpp's constants: their values
    this.inHeader = true;
    const init = member.initializer ? ` = ${this.Expr(member.initializer)}` : '';
    this.inHeader = false;
    return `${cppType} ${member.name.text}${init};`;
  }

  Method(member, interfaceMethods) {
    const name = member.name.text;
    this.currentMethod = name;
    const isAbstract = member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AbstractKeyword);
    let ret;
    let params;
    let isConst = false;
    let suffix = '';
    let virtual = '';
    let handlerAccess = null;
    let signature = interfaceMethods.get(name);
    // the overload of as many parameters
    if (signature?.overloads?.length > 1 && member.parameters) {
      signature = signature.overloads.find(item => item.isVirtual && cppParams(item.params).length === member.parameters.length) ?? signature;
    }
    if (ts.isGetAccessorDeclaration(member)) {
      // its type is what it returns (a reference to an Nvram, a value...): it is defined before the methods that use it
      ret = 'decltype(auto)';
      params = [];
      isConst = !!this.forceConst;
    } else if (!signature && this.ownMethods.has(name) && !this.handlers.has(name) && !this.pointerMethods.has(name)
      && cppParams(this.ownMethods.get(name).params).length === member.parameters.length && this.OwnParamsMatch(this.ownMethods.get(name), member)) {
      const own = this.ownMethods.get(name);
      ret = own.ret === 'Fsm::Reaction' ? 'Reaction' : this.QualifyCppType(own.ret);
      for (const id of `${own.ret} ${own.params}`.match(/[A-Za-z_]\w*/g) ?? []) if (/^[A-Z]/.test(id) && this.index.HasTopLevel(id)) this.UseHeader(id, true);
      params = cppParams(own.params).map(param => ({ ...param, type: this.QualifyCppType(param.type) })).map((param, i) => {
        const tsParam = member.parameters[i];
        const tsName = tsParam?.name.getText().replace(/^_/, '') ?? param.name ?? `arg${i}`;
        return `${tsParam && !tsParam.name.getText().startsWith('_') ? '' : '[[maybe_unused]] '}${param.type} ${tsName}`;
      });
      isConst = own.isConst;
      if (own.isVirtual) virtual = 'virtual ';
    } else if (this.pointerMethods.has(name)) {
      // it reads (ConstNvram...): const, as C++ calls it from const methods
      ret = this.pointerMethods.get(name);
      isConst = true;
      params = member.parameters.map(param => `${this.CppType(this.checker.getTypeAtLocation(param), param, true)} ${param.name.getText()}`);
    } else if (signature) {
      ret = signature.ret === 'Fsm::Reaction' ? 'Reaction' : this.QualifyCppType(signature.ret);
      const cpp = cppParams(signature.params).map(param => ({ ...param, type: this.QualifyCppType(param.type) }));
      params = cpp.map((param, i) => {
        const tsParam = member.parameters[i];
        const tsName = tsParam?.name.getText().replace(/^_/, '');
        const used = tsParam && !tsParam.name.getText().startsWith('_');
        return `${used ? '' : '[[maybe_unused]] '}${param.type} ${tsName ?? param.name ?? `arg${i}`}`;
      });
      isConst = signature.isConst;
      suffix = ' override';
    } else if (this.handlers.has(name)) {
      ret = 'Reaction';
      handlerAccess = 'private';
      const types = cppParams(this.handlers.get(name)).map(param => this.QualifyCppType(param.type));
      for (const type of types) for (const id of type.match(/[A-Za-z_]\w*/g) ?? []) if (/^[A-Z]/.test(id) && this.index.HasTopLevel(id)) this.UseHeader(id, true);
      params = types.map((type, i) => {
        const tsParam = member.parameters[i];
        const tsName = tsParam?.name.getText().replace(/^_/, '');
        const used = tsParam && !tsParam.name.getText().startsWith('_');
        return `${used ? '' : '[[maybe_unused]] '}${type} ${tsName ?? `arg${i}`}`;
      });
    } else {
      const tsSignature = this.checker.getSignatureFromDeclaration(member);
      ret = (member.type && this.CppTypeNode(member.type)) || this.CppType(this.checker.getReturnTypeOfSignature(tsSignature), member);
      params = member.parameters.map(param => {
        const type = this.DeclaredType(param, true);
        const tsName = param.name.getText();
        return tsName.startsWith('_') ? `[[maybe_unused]] ${type} ${tsName.slice(1)}` : `${type} ${tsName}`;
      });
      if (isAbstract || this.Access(member) !== 'private') virtual = 'virtual ';
    }
    const access = handlerAccess ?? (signature ? 'public' : this.Access(member));
    if (isAbstract && signature) return { access, declaration: `// ${name}: the interface's`, definition: null };
    if (isAbstract) {
      return { access, declaration: `virtual ${ret} ${name}(${params.join(', ')})${isConst ? ' const' : ''} = 0;`, definition: null };
    }
    // TypeScript defaults stay in the declaration
    const declared = params.map((param, i) => {
      const initializer = member.parameters?.[i]?.initializer;
      return initializer ? `${param} = ${this.Expr(initializer)}` : param;
    });
    const declaration = `${suffix ? '' : virtual}${ret} ${name}(${declared.join(', ')})${isConst ? ' const' : ''}${suffix};`;
    this.unsignedParams = new Set(params.map(param => /^(?:const\s+)?(size_t|unsigned|uint\d+_t)\s+(\w+)$/.exec(param.replace(/\[\[maybe_unused\]\]\s*/, ''))?.[2]).filter(Boolean));
    this.returnType = ret;
    this.inConstMethod = isConst;
    // parameters C++ has as pointers (Ptr<T>, T*)
    for (const [i, param] of (member.parameters ?? []).entries()) {
      if (/(\*|^(?:const\s+)?(?:Ptr|std::shared_ptr)<.*>)(\s+\[\[maybe_unused\]\])?\s*\w*$/.test(params[i]?.replace(/\[\[maybe_unused\]\]\s*/, '').replace(/\s+\w+$/, '') ?? '')) {
        this.pointers.add(this.checker.getSymbolAtLocation(param.name));
      }
    }
    const body = this.Block(member.body, 2);
    this.inConstMethod = false;
    const definedRet = this.localEnums?.has(ret) || this.localStructs?.has(ret) ? `${this.className}::${ret}` : ret;
    const definition = `${I}${definedRet} ${this.className}::${name}(${params.join(', ')})${isConst ? ' const' : ''}\n${I}${body}`;
    return { access, declaration, definition };
  }

  /** Whether a C++ method's parameters are the TypeScript method's (a translated class keeps the C++ declarations that
   * say the same as its TypeScript). */
  OwnParamsMatch(own, member) {
    const list = cppParams(own.params);
    // a reference returned: only of what outlives the call (no literal, no temporary)
    if (/&$/.test(own.ret.trim()) && member.body) {
      let temporary = false;
      const visit = item => {
        if (ts.isReturnStatement(item) && item.expression && !ts.isPropertyAccessExpression(item.expression) && !ts.isElementAccessExpression(item.expression)
          && !this.ReturnsReference(item.expression)) temporary = true;
        if (!ts.isFunctionLike(item) || item === member) ts.forEachChild(item, visit);
      };
      visit(member);
      if (temporary) return false;
    }
    if (member.type) {
      const ret = this.CppTypeNode(member.type);
      if (ret && !this.SameType(this.QualifyCppType(own.ret), ret)) return false;
    } else if (own.ret !== 'void' && !/\bReaction\b/.test(own.ret)) {
      try {
        const ret = this.CppType(this.checker.getReturnTypeOfSignature(this.checker.getSignatureFromDeclaration(member)), member);
        if (!this.SameType(this.QualifyCppType(own.ret), ret)) return false;
      } catch (error) {
        if (!(error instanceof TranslationError)) throw error;
        return false;
      }
    }
    return member.parameters.every((param, i) => {
      let derived = null;
      try {
        derived = this.DeclaredType(param, true);
      } catch (error) {
        if (!(error instanceof TranslationError)) throw error;
        return true;
      }
      return this.SameType(this.QualifyCppType(list[i]?.type ?? ''), derived);
    });
  }

  /** Whether a call returns a C++ reference (GetReelRoundRules returns const ReelRoundRules&). */
  ReturnsReference(node) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
    const owner = node.expression.expression;
    const ownerName = owner.kind === ts.SyntaxKind.ThisKeyword ? this.className : this.checker.getNonNullableType(this.checker.getTypeAtLocation(owner)).symbol?.name;
    if (owner.kind !== ts.SyntaxKind.ThisKeyword && ts.isCallExpression(owner) && ts.isPropertyAccessExpression(owner.expression) && REFERENCE_METHODS.has(owner.expression.name.text)) {
      const token = owner.arguments[0];
      const tokenName = token && ts.isIdentifier(token) ? this.OriginalName(token) : null;
      const ret = tokenName ? this.index.Methods(tokenName).get(node.expression.name.text)?.ret : null;
      return /&\s*$/.test(ret ?? '');
    }
    const ret = ownerName ? this.index.Methods(ownerName).get(node.expression.name.text)?.ret : null;
    return /&\s*$/.test(ret ?? '');
  }

  /** A method of a union parameter that starts with `if (p instanceof A) { ...; return; }`: the C++ overloads of it, one
   * for A with that block, one for the other type with the rest (SetupViews(const RoundResult&, ...) and
   * SetupViews(RoundType, ...)). */
  Overloads(member, interfaceMethods) {
    const params = member.parameters;
    const unionIndex = params.findIndex(param => param.type && ts.isUnionTypeNode(param.type) && param.type.types.length === 2);
    const first = member.body?.statements[0];
    if (unionIndex < 0 || !first || !ts.isIfStatement(first) || first.elseStatement) return null;
    let narrowed = this.InstanceOf(first.expression) ?? this.TypeOf(first.expression);
    const param = params[unionIndex];
    // IsArrayOf(values, T): the union's array of T
    const guard = first.expression;
    if (!narrowed && ts.isCallExpression(guard) && ts.isIdentifier(guard.expression) && guard.expression.text === 'IsArrayOf' && guard.arguments.length === 2
      && ts.isIdentifier(guard.arguments[0])) {
      const element = guard.arguments[1].getText();
      const alternative = param.type.types.find(item => {
        const type = this.checker.getTypeFromTypeNode(item);
        return this.checker.isArrayType(type) && this.checker.getTypeArguments(type)[0].symbol?.name === element;
      });
      if (alternative) narrowed = { symbol: this.checker.getSymbolAtLocation(guard.arguments[0]), name: guard.arguments[0].text, type: alternative.getText() };
    }
    if (!narrowed || narrowed.name !== param.name.getText()) return null;
    this.currentMethod = member.name.getText();
    const thenStatements = ts.isBlock(first.thenStatement) ? [...first.thenStatement.statements] : [first.thenStatement];
    if (!thenStatements.length || !ts.isReturnStatement(thenStatements[thenStatements.length - 1])) return null;
    const other = param.type.types.find(item => item.getText() !== narrowed.type);
    const name = member.name.getText();
    const signatures = interfaceMethods.get(name)?.overloads ?? [];
    const cppTypePattern = { number: '(int|int64_t|int32_t|unsigned|size_t|uint32_t|uint64_t)', boolean: 'bool', string: '(std::string|std::string_view)' };
    const build = (typeNode, statements) => {
      const typeName = typeNode.getText();
      const signature = signatures.find(item => new RegExp(`\\b${cppTypePattern[typeName] ?? typeName}\\b`).test(cppParams(item.params)[unionIndex]?.type ?? ''));
      const used = signature ? params.slice(0, cppParams(signature.params).length) : params;
      const cppParamList = used.map((item, i) => {
        if (signature) return `${this.QualifyCppType(cppParams(signature.params)[i]?.type ?? 'auto')} ${item.name.getText()}`;
        const type = i === unionIndex ? (this.CppTypeNode(typeNode) ?? this.Fail(item, 'no C++ type')) : this.DeclaredType(item, true);
        return `${i === unionIndex && !/^(bool|int|int64_t)$/.test(type) && !/::E?[A-Z]\w*Type$|RoundType$/.test(type) ? `const ${type}&` : type} ${item.name.getText()}`;
      });
      const ret = signature ? (signature.ret === 'Fsm::Reaction' ? 'Reaction' : this.QualifyCppType(signature.ret)) : 'void';
      this.returnType = ret;
      const lines = statements.filter(statement => !(ts.isReturnStatement(statement) && !statement.expression)).map(statement => this.Statement(statement, 2));
      return {
        access: signature ? 'public' : this.Access(member),
        declaration: `${ret} ${name}(${cppParamList.join(', ')})${signature?.isConst ? ' const' : ''}${signature ? ' override' : ''};`,
        definition: `${I}${ret} ${this.className}::${name}(${cppParamList.join(', ')})${signature?.isConst ? ' const' : ''}\n${I}{\n${lines.join('\n')}\n${I}}`,
      };
    };
    return [build(param.type.types.find(item => item.getText() === narrowed.type), thenStatements), build(other, member.body.statements.slice(1))];
  }

  /** A function of the module, for the .cpp's anonymous namespace. */
  Function(declaration) {
    const signature = this.checker.getSignatureFromDeclaration(declaration);
    const ret = (declaration.type && this.CppTypeNode(declaration.type)) || this.CppType(this.checker.getReturnTypeOfSignature(signature), declaration);
    const params = declaration.parameters.map(param => `${this.DeclaredType(param, true)} ${param.name.getText()}`);
    this.returnType = ret;
    this.inFunction = true;
    const body = this.Block(declaration.body, 3);
    this.inFunction = false;
    return `${I}${I}${ret} ${declaration.name.text}(${params.join(', ')})\n${I}${I}${body}\n`;
  }

  /** A module constant, for the .cpp's anonymous namespace: an id, a list of ids, a number. */
  ModuleConstant(declaration) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) this.Fail(declaration, 'a module variable');
    const name = declaration.name.text;
    const init = declaration.initializer;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return `${I}${I}[[maybe_unused]] const std::string ${name} = ${JSON.stringify(init.text)};`;
    if (ts.isArrayLiteralExpression(init) && init.elements.every(item => ts.isStringLiteral(item) || ts.isIdentifier(item))
      && init.elements.length && this.checker.getTypeAtLocation(init.elements[0]).flags & ts.TypeFlags.StringLike
      && !(this.checker.getTypeAtLocation(init.elements[0]).flags & ts.TypeFlags.EnumLike)) {
      return `${I}${I}[[maybe_unused]] const std::vector<std::string_view> ${name} = {${init.elements.map(item => this.Expr(item)).join(', ')}};`;
    }
    if (ts.isNumericLiteral(init) || (ts.isPrefixUnaryExpression(init) && ts.isNumericLiteral(init.operand))) {
      return `${I}${I}[[maybe_unused]] constexpr ${declaration.type ? this.CppTypeNode(declaration.type) ?? 'int64_t' : (init.getText().includes('.') ? 'double' : 'int64_t')} ${name} = ${init.getText()};`;
    }
    const type = declaration.type ? this.CppTypeNode(declaration.type) : null;
    this.atModule = true;
    const value = this.Expr(init).replace(/\[&\]/g, '[]').replace(/\[=\]/g, '[]');
    this.atModule = false;
    return `${I}${I}[[maybe_unused]] const ${type ?? 'auto'} ${name} = ${value};`;
  }

  /** Whether a class is a state or a view: by the class it extends, State or BaseView. */
  ClassKind(declaration) {
    let current = declaration;
    for (let depth = 0; current && depth < 10; depth++) {
      const heritage = current.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0].expression;
      if (!heritage) return null;
      if (heritage.getText() === 'State') return 'state';
      if (heritage.getText() === 'BaseView') return 'view';
      if (heritage.getText() === 'BaseVisual') return 'visual';
      let symbol = this.checker.getSymbolAtLocation(heritage);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
      current = symbol?.valueDeclaration && ts.isClassDeclaration(symbol.valueDeclaration) ? symbol.valueDeclaration : null;
    }
    return null;
  }

  /** A view's C++ bases: the class it extends (a class template of its interface, ButtonView<IBetUpSwButtonView>), and
   * the interfaces it implements; their methods, which it overrides. */
  ViewBases(declaration, members) {
    const extendsType = declaration.heritageClauses.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword).types[0];
    const base = extendsType.expression.getText();
    const implementedNames = (declaration.heritageClauses.find(clause => clause.token === ts.SyntaxKind.ImplementsKeyword)?.types ?? [])
      .map(item => item.expression.getText());
    for (const name of implementedNames) if (!this.index.Has(name)) this.Fail(declaration.name, `implements ${name}, which the C++ does not declare (a new interface is not translated)`);
    const implemented = implementedNames;
    let templateArg = null;
    if (this.index.IsTemplate(base)) {
      const typeArg = extendsType.typeArguments?.[0]?.getText();
      const constructor = members.find(member => ts.isConstructorDeclaration(member));
      const superCall = this.SuperCall(constructor);
      const token = superCall?.arguments.find(arg => ts.isIdentifier(arg) && /^I[A-Z]/.test(arg.text) && this.index.Has(arg.text))?.getText();
      templateArg = (typeArg && this.index.Has(typeArg) ? typeArg : null) ?? token ?? implemented[0] ?? null;
      if (!templateArg) this.Fail(extendsType, `${base} is a class template of the view's interface, which the view does not name`);
    }
    this.UseHeader(base, true);
    const bases = [templateArg ? `${base}<${this.Name(templateArg, true)}>` : base];
    for (const name of implemented) {
      if (name === templateArg) continue;
      bases.push(this.Name(name, true));
    }
    const methods = new Map();
    for (const name of [templateArg, ...implemented, base].filter(Boolean)) {
      for (const [method, signature] of this.index.Methods(name)) {
        const virtual = signature.overloads?.find(item => item.isVirtual) ?? (signature.isVirtual ? signature : null);
        if (virtual && !methods.has(method)) methods.set(method, { ...virtual, overloads: signature.overloads });
      }
    }
    // the other C++ classes it derives from (BaseReelsView): their constructors, from the view's fields
    this.extraBases = implemented.filter(name => name !== templateArg && !this.index.IsTemplate(name) && this.index.Constructors(name).length);
    this.baseCpp = base;
    return { bases, methods, scopes: [base, ...implemented, templateArg].filter(Boolean), templateArg };
  }

  /** Whether IX::Events is, or derives from, IY::Events. */
  EventsDerive(owner, wanted, depth = 0) {
    if (owner === wanted) return true;
    if (depth > 5) return false;
    const cls = this.index.Class(owner);
    const match = cls && /struct\s+(?:EGT_\w+\s+)?Events\b\s*(:[^{]*)?\{/.exec(cls.body);
    const bases = (match?.[1] ?? '').replace(/^:/, '').split(',').map(base => /(\w+)::Events/.exec(base)?.[1]).filter(Boolean);
    return bases.some(base => this.EventsDerive(base, wanted, depth + 1));
  }

  /** The super(...) call of a constructor. */
  SuperCall(constructor) {
    const first = constructor?.body?.statements.find(statement => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
      && statement.expression.expression.kind === ts.SyntaxKind.SuperKeyword);
    return first ? first.expression : null;
  }

  /** A view's constructor: its base's, with what the C++ base takes of the super(...) arguments: the name, the view's
   * events (m_events), a label (from the class's name); the interface token and events the TypeScript passes are C++'s
   * template argument and m_events. */
  Constructor(member, view) {
    const superCall = this.SuperCall(member);
    const passed = (superCall?.arguments ?? []).filter(arg => !this.IsToken(arg)
      && !(ts.isNewExpression(arg) && /Events$/.test(arg.expression.getText())));
    const classDeclaration = this.sourceFile.statements.find(statement => ts.isClassDeclaration(statement) && statement.name?.text === this.className);
    const hasEvents = classDeclaration.members.some(item => ts.isPropertyDeclaration(item) && item.name.getText() === 'm_events');
    const constructors = this.index.Constructors(this.baseCpp);
    const label = this.className.replace(/(SwButton)?View$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    const fill = params => {
      const list = cppParams(params);
      const args = [];
      let next = 0;
      for (const param of list) {
        if (/Events&$/.test(param.type)) {
          if (!hasEvents) return null;
          const owner = this.eventsFields?.get('m_events');
          const wanted = /(\w+)::Events&$/.exec(param.type)?.[1];
          if (owner && wanted && !this.EventsDerive(owner, wanted)) return null;
          args.push('m_events');
        } else if (next < passed.length) {
          const value = this.Expr(passed[next++]);
          args.push(/^std::string$/.test(param.type) ? `std::string(${value})` : value);
        } else if (/^std::string$/.test(param.type) && param.name === 'label') {
          args.push(JSON.stringify(label));
        } else return null;
      }
      return next === passed.length ? args : null;
    };
    const candidates = constructors.map(fill).filter(Boolean).sort((a, b) => b.length - a.length);
    if (constructors.length && !candidates.length) this.Fail(member ?? superCall ?? this.sourceFile.statements[0], `no constructor of ${this.baseCpp} takes ${passed.map(arg => arg.getText()).join(', ')}`);
    const params = (member?.parameters ?? []).map(param => {
      const type = this.DeclaredType(param, true);
      const symbol = this.checker.getTypeAtLocation(param).symbol;
      if (symbol && symbol.flags & ts.SymbolFlags.Interface && this.index.IsAbstract(symbol.name)) return `${type.replace(/^const\s+/, '').replace(/&$/, '')}& ${param.name.getText()}`;
      return `${type} ${param.name.getText()}`;
    });
    // parameter properties (private readonly m_x: T): fields the constructor initializes
    const properties = (member?.parameters ?? []).filter(param => param.modifiers?.some(modifier => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword,
      ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.ReadonlyKeyword].includes(modifier.kind)));
    this.propertyFields = properties.map(param => {
      let type = this.DeclaredType(param).replace(/^ElementsList$/, 'ElementsList&');
      const symbol = this.checker.getTypeAtLocation(param).symbol;
      // an interface it is given (the view that owns it, a config): a reference
      if (symbol && symbol.flags & ts.SymbolFlags.Interface && !/[&*>]$/.test(type)) {
        const isReadonly = param.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword);
        type = this.index.IsAbstract(symbol.name) || !isReadonly ? `${type}&` : `const ${type}&`;
      }
      return { access: this.Access(param), declaration: `${type} ${param.name.getText()};`, name: param.name.getText() };
    });
    const rest = (member?.body?.statements ?? []).filter(statement => !(superCall && ts.isExpressionStatement(statement) && statement.expression === superCall));
    this.returnType = 'void';
    const body = rest.map(statement => this.Statement(statement, 2)).join('\n');
    const extraInits = (this.extraBases ?? []).map(base => {
      const fields = classDeclaration.members.filter(item => ts.isPropertyDeclaration(item));
      for (const params of this.index.Constructors(base)) {
        const list = cppParams(params);
        const args = list.map(param => {
          const wanted = param.type.replace(/\bconst\b|&/g, '').trim();
          const field = fields.find(item => {
            const type = item.type ? this.CppTypeNode(item.type) : null;
            return type && this.SameType(this.QualifyCppType(wanted), type);
          });
          return field ? field.name.getText() : null;
        });
        if (args.every(Boolean)) return `${base}(${args.join(', ')})`;
      }
      this.Fail(member ?? classDeclaration, `no constructor of ${base} takes the view's fields`);
    });
    const inits = [...(candidates.length ? [`${this.baseCpp}(${candidates[0].join(', ')})`] : []), ...extraInits, ...this.propertyFields.map(field => `${field.name}(${field.name})`)];
    const init = inits.length ? `\n${I}${I}: ${inits.join(`\n${I}${I}, `)}` : '';
    return {
      declaration: `${params.length === 1 ? 'explicit ' : ''}${this.className}(${params.join(', ')});`,
      definition: `${I}${this.className}::${this.className}(${params.join(', ')})${init}\n${I}{\n${body}${body ? '\n' : ''}${I}}`,
    };
  }

  /** A getter's C++ return type: a reference to what a token method returns, or the value's type. */
  GetterType(getter) {
    const statement = getter.body?.statements[0];
    if (statement && ts.isReturnStatement(statement) && statement.expression && ts.isCallExpression(statement.expression)) {
      const call = statement.expression;
      const method = ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : '';
      if (REFERENCE_METHODS.has(method) && call.arguments.length === 1) {
        const target = this.TokenName(call.arguments[0]);
        return `${REFERENCE_METHODS.get(method)}${target}&`;
      }
    }
    return this.CppType(this.checker.getReturnTypeOfSignature(this.checker.getSignatureFromDeclaration(getter)), getter);
  }

  // Types -------------------------------------------------------------------------------------------------------------

  /** A declaration's C++ type: from its type annotation as written (which keeps names such as FigureId and uint32_t that
   * TypeScript drops from number), or else from its TypeScript type. */
  DeclaredType(declaration, isParam = false) {
    const typeNode = declaration.type;
    const translated = typeNode ? this.CppTypeNode(typeNode) : null;
    if (translated) {
      const byValue = /^(bool|int|unsigned|u?int\d+_t|size_t|float|double|int64_t)$/.test(translated) || /::E[A-Z]\w*$|^E[A-Z]\w*$/.test(translated);
      // what is drawn on, the list elements are made in
      if (isParam && (translated === 'video_ctrl::draw_list' || translated === 'ElementsList')) return `${translated}&`;
      if (isParam && /^Ptr</.test(translated)) return `const ${translated}&`;
      return isParam && !byValue ? `const ${translated}&` : translated;
    }
    return this.CppType(this.checker.getTypeAtLocation(declaration), declaration, isParam);
  }

  /** A type annotation's C++, or null when only its TypeScript type says it. */
  CppTypeNode(node) {
    switch (node.kind) {
      case ts.SyntaxKind.NumberKeyword: return 'int64_t';
      case ts.SyntaxKind.BooleanKeyword: return 'bool';
      case ts.SyntaxKind.StringKeyword: return 'std::string';
      case ts.SyntaxKind.VoidKeyword: return 'void';
      default: break;
    }
    if (ts.isArrayTypeNode(node)) {
      const element = this.CppTypeNode(node.elementType);
      if (element && this.IsElementType(this.checker.getTypeFromTypeNode(node.elementType))) return `std::vector<${element}*>`;
      return element ? `std::vector<${element}>` : null;
    }
    if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) return this.CppTypeNode(node.type);
    if (ts.isParenthesizedTypeNode(node)) return this.CppTypeNode(node.type);
    if (ts.isIndexedAccessTypeNode(node)) return this.CppType(this.checker.getTypeFromTypeNode(node), node);
    if (ts.isTupleTypeNode(node)) {
      const items = node.elements.map(item => this.CppTypeNode(item));
      if (items.some(item => !item)) return null;
      if (items.every(item => item === items[0])) return `std::array<${items[0]}, ${items.length}>`;
      return `std::tuple<${items.join(', ')}>`;
    }
    if (ts.isFunctionTypeNode(node)) {
      const ret = this.CppTypeNode(node.type);
      const params = node.parameters.map(param => (param.type ? this.CppTypeNode(param.type) : null));
      if (!ret || params.some(param => !param)) return null;
      this.headerIncludes.add('functional');
      return `std::function<${ret}(${params.join(', ')})>`;
    }
    if (ts.isUnionTypeNode(node)) {
      const rest = node.types.filter(item => !(item.kind === ts.SyntaxKind.LiteralType && item.literal.kind === ts.SyntaxKind.NullKeyword)
        && item.kind !== ts.SyntaxKind.UndefinedKeyword);
      if (rest.length === 1 && rest.length < node.types.length) {
        const inner = this.CppTypeNode(rest[0]);
        // a tween: an empty tween_action is none
        if (inner === 'tweeny::tween_action') return inner;
        // an interface: held by its pointer; an element: by its pointer into the elements list
        if (inner && ts.isTypeReferenceNode(rest[0]) && this.index.IsAbstract(rest[0].typeName.getText())) return `Ptr<${inner}>`;
        if (inner && this.IsElementType(this.checker.getTypeFromTypeNode(rest[0]))) return `${inner}*`;
        if (inner && /^Ptr</.test(inner)) return inner;
        return inner ? `std::optional<${inner}>` : null;
      }
      return null;
    }
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName.getText();
      const args = (node.typeArguments ?? []).map(arg => this.CppTypeNode(arg));
      if (args.some(arg => !arg)) return null;
      if (PRIMITIVE_ALIASES.has(name)) return name;
      if (name === 'Map' || name === 'ReadonlyMap') return `std::map<${args[0]}, ${args[1]}>`;
      if (name === 'Set' || name === 'ReadonlySet') return `std::set<${args[0]}>`;
      if (name === 'Array' || name === 'ReadonlyArray') return `std::vector<${args[0]}>`;
      if (name === 'Reaction') return 'Reaction';
      if (VIDEO_TYPES[name] && !this.index.Has(name)) return VIDEO_TYPES[name].cpp;
      if (name === 'DrawList') return 'video_ctrl::draw_list';
      if (this.localStructs?.has(name)) return name;
      if (this.IsTweenName(name)) {
        this.includes.add('tweeny/tween_action.h');
        this.headerIncludes.add('tweeny/tween_action.h');
        return 'tweeny::tween_action';
      }
      if ((this.index.Has(name) || this.IsEventsName(name)) && this.IsVisualType(this.checker.getTypeFromTypeNode(node)) && !this.inVisualOwnType) {
        return `Ptr<${this.Name(name, true, this.ModuleHint(node.typeName))}>`;
      }
      if (this.index.Has(name) || this.IsEventsName(name)) return this.Name(name, true, this.ModuleHint(node.typeName));
      if (name === 'ElementsList') return 'ElementsList';
      if ((name === 'Record' || name === 'Partial') && args.length === 2) return `std::map<${args[0]}, ${args[1]}>`;
      if (name === 'Partial' && args.length === 1) return args[0];
      // a TypeScript alias of a type the C++ names: what it stands for
      let symbol = this.checker.getSymbolAtLocation(node.typeName);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
      const alias = symbol?.declarations?.find(declaration => ts.isTypeAliasDeclaration(declaration));
      if (alias) return this.CppTypeNode(alias.type);
      return null;
    }
    return null;
  }

  CppType(type, node, isParam = false) {
    const checker = this.checker;
    if (type.aliasSymbol && this.index.Has(type.aliasSymbol.name)) {
      const name = this.Name(type.aliasSymbol.name, true);
      return isParam ? `const ${name}&` : name;
    }
    if (type.flags & ts.TypeFlags.Void) return 'void';
    if (type.flags & ts.TypeFlags.BooleanLike) return 'bool';
    if (type.flags & ts.TypeFlags.NumberLike) return 'int64_t';
    if (type.flags & ts.TypeFlags.StringLike) return isParam ? 'const std::string&' : 'std::string';
    if (type.isUnion()) {
      const rest = type.types.filter(item => !(item.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)));
      if (rest.length === 1 && rest.length < type.types.length) {
        if (this.IsTweenType(rest[0])) return this.CppType(rest[0], node, isParam);
        if (this.IsElementType(rest[0])) return `${this.CppType(rest[0], node)}*`;
        if (this.IsVisualType(rest[0])) return this.CppType(rest[0], node);
        if (rest[0].symbol && this.index.IsAbstract(rest[0].symbol.name)) return `Ptr<${this.CppType(rest[0], node)}>`;
        return `std::optional<${this.CppType(rest[0], node)}>`;
      }
      if (type.types.every(item => item.flags & ts.TypeFlags.BooleanLike)) return 'bool';
      if (type.types.every(item => item.flags & ts.TypeFlags.EnumLiteral)) {
        const local = type.types[0].symbol?.parent;
        if (local?.declarations?.some(item => ts.isEnumDeclaration(item) && item.getSourceFile() === this.sourceFile)) return local.name;
        const base = checker.getBaseTypeOfLiteralType(type);
        if (base !== type) return this.CppType(base, node, isParam);
        const enumName = type.types[0].symbol?.parent?.name;
        if (enumName && this.index.Has(enumName)) return this.Name(enumName, true);
        this.Fail(node, `no C++ type for ${checker.typeToString(type)}`);
      }
    }
    if (type.flags & ts.TypeFlags.EnumLike || (type.isUnion() && type.types.every(item => item.flags & ts.TypeFlags.EnumLiteral))) {
      const enumSymbol = type.isUnion() ? type.types[0].symbol?.parent : (type.symbol?.parent ?? type.symbol);
      // an enum of this file: nested in the class
      if (enumSymbol?.declarations?.some(item => ts.isEnumDeclaration(item) && item.getSourceFile() === this.sourceFile)) return enumSymbol.name;
    }
    if (type.flags & ts.TypeFlags.EnumLike) {
      const name = (type.symbol?.parent ?? type.symbol)?.name;
      if (name && this.index.Has(name)) return this.Name(name, true);
    }
    const symbol = type.aliasSymbol ?? type.symbol;
    const name = symbol?.name;
    if (name === 'Reaction') return 'Reaction';
    if (this.IsTweenType(type)) {
      this.headerIncludes.add('tweeny/tween_action.h');
      return 'tweeny::tween_action';
    }
    if (name && VIDEO_TYPES[name] && !this.index.Has(name)) return isParam ? `const ${VIDEO_TYPES[name].cpp}&` : VIDEO_TYPES[name].cpp;
    if (checker.isArrayType(type)) {
      const elementType = checker.getTypeArguments(type)[0];
      const element = `${this.CppType(elementType, node)}${this.IsElementType(elementType) ? '*' : ''}`;
      return isParam ? `const std::vector<${element}>&` : `std::vector<${element}>`;
    }
    if ((name === 'Map' || name === 'ReadonlyMap') && type.typeArguments?.length === 2) {
      const [key, value] = type.typeArguments.map(item => this.CppType(item, node));
      return isParam ? `const std::map<${key}, ${value}>&` : `std::map<${key}, ${value}>`;
    }
    if ((name === 'Set' || name === 'ReadonlySet') && type.typeArguments?.length === 1) {
      const key = this.CppType(type.typeArguments[0], node);
      return isParam ? `const std::set<${key}>&` : `std::set<${key}>`;
    }
    if (name && this.index.Has(name) && this.IsVisualType(type)) return `Ptr<${this.Name(name, true)}>`;
    if (name && this.localStructs?.has(name)) return isParam ? `const ${name}&` : name;
    if (name && (this.index.Has(name) || this.IsEventsName(name))) {
      const qualified = this.Name(name, true);
      return isParam ? `const ${qualified}&` : qualified;
    }
    this.Fail(node, `no C++ type for ${checker.typeToString(type)}`);
  }

  // Statements --------------------------------------------------------------------------------------------------------

  Block(block, depth) {
    const pad = I.repeat(depth - 1);
    const lines = [];
    const narrowings = [];
    for (const statement of block.statements) {
      lines.push(this.Statement(statement, depth));
      // if (!(x instanceof T)) return ...; narrows x for the rest of the block
      if (ts.isIfStatement(statement) && !statement.elseStatement && ts.isPrefixUnaryExpression(statement.expression)
        && statement.expression.operator === ts.SyntaxKind.ExclamationToken) {
        const narrowed = this.InstanceOf(statement.expression.operand);
        const exits = ts.isReturnStatement(statement.thenStatement)
          || (ts.isBlock(statement.thenStatement) && statement.thenStatement.statements.some(item => ts.isReturnStatement(item)));
        if (narrowed && exits) {
          lines.push(this.Narrow(narrowed, I.repeat(depth)));
          narrowings.push(narrowed.symbol);
        }
      }
    }
    for (const symbol of narrowings) this.renames.delete(symbol);
    const inner = lines.join('\n');
    return `{\n${inner}${inner ? '\n' : ''}${pad}}`;
  }

  Statement(node, depth) {
    const pad = I.repeat(depth);
    if (ts.isBlock(node)) return `${pad}${this.Block(node, depth + 1)}`;
    if (ts.isExpressionStatement(node)) return this.ExpressionStatement(node.expression, pad);
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.map(declaration => this.Variable(declaration, node.declarationList, pad)).join('\n');
    if (ts.isReturnStatement(node)) {
      if (node.expression?.kind === ts.SyntaxKind.NullKeyword && /\*$/.test(this.returnType ?? '')) return `${pad}return nullptr;`;
      return `${pad}return${node.expression ? ` ${this.Expr(node.expression)}` : ''};`;
    }
    if (ts.isIfStatement(node)) return this.If(node, depth);
    if (ts.isForOfStatement(node)) {
      const declaration = node.initializer.declarations?.[0];
      if (!declaration) this.Fail(node, 'for-of without a declaration');
      // for (const [key, value] of map): a structured binding
      if (ts.isArrayBindingPattern(declaration.name)) {
        const names = declaration.name.elements.map(element => (ts.isBindingElement(element) ? element.name.getText() : '_'));
        return `${pad}for (auto&& [${names.join(', ')}] : ${this.Expr(node.expression)})\n${this.Body(node.statement, depth)}`;
      }
      const name = ts.isIdentifier(declaration.name) ? declaration.name.text : this.Fail(declaration, 'destructuring in for-of');
      // over a list of tokens (interfaces, data classes): a block for each, as C++ names each type
      if (ts.isArrayLiteralExpression(node.expression) && node.expression.elements.length && node.expression.elements.every(element => this.IsToken(element))) {
        const symbol = this.checker.getSymbolAtLocation(declaration.name);
        const blocks = node.expression.elements.map(element => {
          this.tokenRenames.set(symbol, this.TokenName(element));
          const block = this.Body(node.statement, depth);
          this.tokenRenames.delete(symbol);
          return block;
        });
        return blocks.join('\n');
      }
      // over a list of fields of different C++ types (vectors of different visuals): a block for each
      if (ts.isArrayLiteralExpression(node.expression) && node.expression.elements.length > 1
        && node.expression.elements.every(element => ts.isPropertyAccessExpression(element) || ts.isIdentifier(element))
        && !(this.checker.getTypeAtLocation(node.expression.elements[0]).flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.StringLike | ts.TypeFlags.EnumLike))) {
        const symbol = this.checker.getSymbolAtLocation(declaration.name);
        return node.expression.elements.map(element => {
          this.renames.set(symbol, name);
          const block = `${pad}{\n${pad}${I}auto&& ${name} = ${this.Expr(element)};\n${this.Body(node.statement, depth + 1)}\n${pad}}`;
          this.renames.delete(symbol);
          return block;
        }).join('\n');
      }
      this.MarkVariable(declaration);
      const loopBody = this.Body(node.statement, depth);
      // a loop of what C++ does elsewhere (a tween's Process): nothing
      if (!loopBody.replace(/\/\/[^\n]*/g, '').replace(/[{}\s]/g, '')) return `${pad}// (tweeny's manager runs the tweens)`;
      return `${pad}for (auto&& ${name} : ${this.Expr(node.expression)})\n${loopBody}`;
    }
    if (ts.isForStatement(node)) {
      const init = node.initializer && ts.isVariableDeclarationList(node.initializer)
        ? node.initializer.declarations.map(declaration => `int64_t ${declaration.name.getText()} = ${this.Expr(declaration.initializer)}`).join(', ')
        : node.initializer ? this.Expr(node.initializer) : '';
      return `${pad}for (${init}; ${node.condition ? this.Expr(node.condition) : ''}; ${node.incrementor ? this.Expr(node.incrementor) : ''})\n${this.Body(node.statement, depth)}`;
    }
    if (ts.isWhileStatement(node)) return `${pad}while (${this.Expr(node.expression)})\n${this.Body(node.statement, depth)}`;
    if (ts.isSwitchStatement(node)) {
      const clauses = node.caseBlock.clauses.map(clause => {
        const label = ts.isCaseClause(clause) ? `case ${this.Expr(clause.expression)}:` : 'default:';
        const statements = clause.statements.map(statement => this.Statement(statement, depth + 2)).join('\n');
        return `${pad}${I}${label}${statements ? `\n${statements}` : ''}`;
      });
      return `${pad}switch (${this.Expr(node.expression)})\n${pad}{\n${clauses.join('\n')}\n${pad}}`;
    }
    if (node.kind === ts.SyntaxKind.BreakStatement) return `${pad}break;`;
    if (node.kind === ts.SyntaxKind.ContinueStatement) return `${pad}continue;`;
    if (ts.isThrowStatement(node)) {
      const message = ts.isNewExpression(node.expression) && node.expression.arguments?.[0] ? this.Expr(node.expression.arguments[0]) : '"error"';
      this.includes.add('stdexcept');
      return `${pad}throw std::logic_error(${message});`;
    }
    if (node.kind === ts.SyntaxKind.EmptyStatement) return '';
    this.Fail(node, `unsupported statement ${ts.SyntaxKind[node.kind]}`);
  }

  Body(statement, depth) {
    if (ts.isBlock(statement)) return `${I.repeat(depth)}${this.Block(statement, depth + 1)}`;
    return `${I.repeat(depth)}{\n${this.Statement(statement, depth + 1)}\n${I.repeat(depth)}}`;
  }

  /** `typeof x === 'number'`, with x an identifier. */
  TypeOf(node) {
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isTypeOfExpression(node.left)
      && ts.isIdentifier(node.left.expression) && ts.isStringLiteral(node.right)) {
      return { symbol: this.checker.getSymbolAtLocation(node.left.expression), name: node.left.expression.text, type: node.right.text };
    }
    return null;
  }

  /** `x instanceof T`, with x an identifier. */
  InstanceOf(node) {
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword && ts.isIdentifier(node.left)) {
      return { symbol: this.checker.getSymbolAtLocation(node.left), name: node.left.text, type: node.right.getText() };
    }
    return null;
  }

  /** Inside an `if (x instanceof T)`, or after `if (!(x instanceof T)) return`, x is the variant's T. */
  Narrow(narrowed, pad) {
    const name = `${narrowed.name}${narrowed.type}`;
    this.renames.set(narrowed.symbol, name);
    this.includes.add('variant');
    return `${pad}auto&& ${name} = std::get<${this.Name(narrowed.type)}>(${narrowed.name});`;
  }

  If(node, depth) {
    const pad = I.repeat(depth);
    const narrowed = this.InstanceOf(node.expression);
    if (narrowed) {
      const condition = this.Condition(node.expression);
      const declaration = this.Narrow(narrowed, `${pad}${I}`);
      const statements = ts.isBlock(node.thenStatement) ? node.thenStatement.statements : [node.thenStatement];
      const body = statements.map(statement => this.Statement(statement, depth + 1)).join('\n');
      this.renames.delete(narrowed.symbol);
      let text = `${pad}if (${condition})\n${pad}{\n${declaration}\n${body}\n${pad}}`;
      if (node.elseStatement) {
        if (ts.isIfStatement(node.elseStatement)) text += `\n${pad}else ${this.If(node.elseStatement, depth).trimStart()}`;
        else text += `\n${pad}else\n${this.Body(node.elseStatement, depth)}`;
      }
      return text;
    }
    let text = `${pad}if (${this.Condition(node.expression)})\n${this.Body(node.thenStatement, depth)}`;
    if (node.elseStatement) {
      if (ts.isIfStatement(node.elseStatement)) text += `\n${pad}else ${this.If(node.elseStatement, depth).trimStart()}`;
      else text += `\n${pad}else\n${this.Body(node.elseStatement, depth)}`;
    }
    return text;
  }

  Condition(expression) {
    return this.Truthiness(expression, null) ?? this.Expr(expression);
  }

  /** Marks a variable as a pointer or an optional by what it is initialized with. */
  MarkVariable(declaration) {
    const symbol = this.checker.getSymbolAtLocation(declaration.name);
    if (declaration.initializer && ts.isElementAccessExpression(declaration.initializer)
      && this.checker.isArrayType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(declaration.initializer.expression)))) {
      this.elements.set(symbol, declaration.initializer);
    }
    if (declaration.initializer && this.IsPointer(declaration.initializer)) this.pointers.add(symbol);
    else if (declaration.initializer && this.IsOptional(declaration.initializer)) this.optionals.add(symbol);
  }

  Variable(declaration, list, pad) {
    if (ts.isArrayBindingPattern(declaration.name) && declaration.initializer && declaration.name.elements.every(item => ts.isBindingElement(item) && ts.isIdentifier(item.name))
      && this.checker.isTupleType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(declaration.initializer)))) {
      const names = declaration.name.elements.map(item => item.name.text);
      const value = this.Expr(declaration.initializer);
      const unwrap = this.IsOptional(declaration.initializer) && !/\.value\(\)$/.test(value) ? '.value()' : '';
      return `${pad}auto&& [${names.join(', ')}] = ${value}${unwrap};`;
    }
    if (!ts.isIdentifier(declaration.name)) this.Fail(declaration, 'destructuring');
    const name = declaration.name.text;
    const isConst = (list.flags & ts.NodeFlags.Const) !== 0;
    if (!declaration.initializer) return `${pad}${this.DeclaredType(declaration)} ${name}{};`;
    // a declared type: the C++ of it (new Map(), [], a number of a C++ integer type...)
    if (declaration.type && this.CppTypeNode(declaration.type)) {
      this.MarkVariable(declaration);
      return `${pad}${isConst && !ts.isNewExpression(declaration.initializer) && !ts.isArrayLiteralExpression(declaration.initializer) ? 'const ' : ''}${this.CppTypeNode(declaration.type)} ${name} = ${this.Expr(declaration.initializer)};`;
    }
    this.MarkVariable(declaration);
    const type = this.checker.getTypeAtLocation(declaration);
    const init = this.Expr(declaration.initializer);
    if (this.IsPointer(declaration.initializer)) return `${pad}auto ${name} = ${init};`;
    const primitive = (type.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.StringLike | ts.TypeFlags.EnumLike)) !== 0;
    // a C++ size or unsigned value: TypeScript's number, signed
    if (type.flags & ts.TypeFlags.NumberLike && /^(size_t|unsigned|uint\d+_t|unsigned\s+\w+)$/.test(this.CppReturnOf(declaration.initializer) ?? '')) {
      return `${pad}${isConst ? 'const ' : ''}auto ${name} = int64_t(${init});`;
    }
    if (primitive) return `${pad}${isConst ? 'const ' : ''}auto ${name} = ${init};`;
    if (ts.isArrayLiteralExpression(declaration.initializer)) {
      if (!init.startsWith('{')) return `${pad}auto ${name} = ${init};`;
      return `${pad}${this.CppType(type, declaration)} ${name}${init};`;
    }
    if (ts.isNewExpression(declaration.initializer) || !isConst) return `${pad}auto ${name} = ${init};`;
    // an element of a temporary (filter(...)[i]): a copy
    if (ts.isElementAccessExpression(declaration.initializer) && ts.isCallExpression(declaration.initializer.expression)) return `${pad}auto ${name} = ${init};`;
    return `${pad}auto&& ${name} = ${init};`;
  }

  /** A call of a tween's method (this.m_action?.Start()). */
  IsTweenCall(node) {
    return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text in TWEEN_METHODS
      && this.IsTweenType(this.checker.getTypeAtLocation(node.expression.expression));
  }

  TweenCall(node, chain) {
    const method = TWEEN_METHODS[node.expression.name.text];
    if (!method) return null;
    // tweeny connects on_begin and on_end: their result is a connection, not the action
    if (['OnBegin', 'OnEnd'].includes(node.expression.name.text) && !ts.isExpressionStatement(node.parent)) {
      this.Fail(node, `a chained ${node.expression.name.text} (call it on the action as a statement, as C++ connects on_end)`);
    }
    const base = this.Expr(node.expression.expression, chain);
    return method(base, node.arguments.map(arg => this.Expr(arg, chain)), `${this.className}:${this.currentMethod ?? ''}`);
  }

  ExpressionStatement(expression, pad) {
    if (ts.isVoidExpression(expression)) return this.ExpressionStatement(expression.expression, pad);
    // what only the browser game does (engine/GameCore/Common/BrowserOnly.ts)
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === 'BrowserOnly') return `${pad}// (browser only)`;
    if (this.IsTweenCall(expression)) {
      const text = this.TweenCall(expression, null);
      return text ? `${pad}${text};` : `${pad}// (${expression.expression.name.text}: tweeny's manager runs the tweens)`;
    }
    // super.Init(runtime): the base's, or no Init
    if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && expression.expression.expression.kind === ts.SyntaxKind.SuperKeyword
      && expression.expression.name.text === 'Init' && expression.arguments.length === 1) {
      this.UseHeader('AssertReturnUnless') || this.includes.add('Egt/GameCore/Common/Defensive.h');
      return `${pad}AssertReturnUnless(${this.baseCpp ?? this.baseName}::Init(std::move(${this.Expr(expression.arguments[0])})), false);`;
    }
    if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && expression.expression.expression.getText() === 'console') {
      return `${pad}// (the browser game's log: ${expression.expression.name.text})`;
    }
    // a?.b(...) as a statement: if (auto* p = a) p->b(...);
    const chain = this.OptionalChainRoot(expression);
    if (chain) {
      const root = this.Expr(chain.root);
      const rest = this.Expr(expression, { replace: chain.root, with: 'p_', pointerRoot: true });
      return `${pad}if (auto&& p_ = ${root})\n${pad}{\n${pad}${I}${rest};\n${pad}}`;
    }
    // Object.assign(target, { a: 1, b: 2 })
    if (ts.isCallExpression(expression) && expression.expression.getText() === 'Object.assign' && expression.arguments.length === 2
      && ts.isObjectLiteralExpression(expression.arguments[1])) {
      const target = this.Expr(expression.arguments[0]);
      const assignments = expression.arguments[1].properties.map(property => {
        if (!ts.isPropertyAssignment(property)) this.Fail(property, 'Object.assign of a spread or method');
        const value = property.initializer.kind === ts.SyntaxKind.NullKeyword ? '{}' : this.Expr(property.initializer);
        return `${pad}${I}target_.${property.name.getText()} = ${value};`;
      });
      return `${pad}{\n${pad}${I}auto& target_ = ${target};\n${assignments.join('\n')}\n${pad}}`;
    }
    return `${pad}${this.Expr(expression)};`;
  }

  /** The expression before the first ?. of a chain, if the expression is an optional chain. */
  OptionalChainRoot(expression) {
    let node = expression;
    while (node) {
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node)) && node.questionDotToken) {
        return { root: node.expression };
      }
      if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
      else return null;
    }
    return null;
  }

  // Expressions -------------------------------------------------------------------------------------------------------

  /** An expression's declared TypeScript type name: RoundInput for GetInput(): RoundInput, or input: RoundInput. */
  DeclaredTypeName(node) {
    let declaration = null;
    if (ts.isCallExpression(node)) declaration = this.checker.getResolvedSignature(node)?.getDeclaration();
    else if (ts.isPropertyAccessExpression(node) || ts.isIdentifier(node)) declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
    const type = declaration && 'type' in declaration ? declaration.type : null;
    return type && ts.isTypeReferenceNode(type) ? type.typeName.getText() : null;
  }

  /** A value C++ has as a std::variant of which the TypeScript knows one class: std::get<Class>(value). */
  VariantAlternative(node, emitted) {
    const alias = this.DeclaredTypeName(node);
    if (!alias || !this.index.IsVariantAlias(alias)) return emitted;
    const type = this.checker.getTypeAtLocation(node);
    if (type.isUnion() || !type.symbol || !(type.symbol.flags & ts.SymbolFlags.Class)) return emitted;
    this.includes.add('variant');
    return `std::get<${this.Name(type.symbol.name)}>(${emitted})`;
  }

  /** Whether a TypeScript type is a union of classes: a C++ std::variant (a round's phases). */
  IsVariant(type) {
    return type.isUnion() && type.types.length > 1 && type.types.every(item => item.symbol && (item.symbol.flags & ts.SymbolFlags.Class));
  }

  /** Whether an expression is a C++ pointer: a RuntimeTryGet, or a variable initialized with one. */
  IsPointer(node) {
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (POINTER_METHODS.has(node.expression.name.text)) return true;
      if (node.expression.name.text === 'find' && this.checker.isArrayType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(node.expression.expression)))) return true;
      if (node.expression.expression.kind === ts.SyntaxKind.ThisKeyword && this.pointerMethods.has(node.expression.name.text)) return true;
      // the state's accessors (Parent<T>(), Nvram<T>()...) are references
      if (node.expression.expression.kind === ts.SyntaxKind.ThisKeyword && TOKEN_METHODS.has(node.expression.name.text)) return false;
      // a C++ method that returns a pointer (const T*, Ptr<T>); a template call of one (GetData<T>() returns Ptr<T>)
      const ret = this.CppReturnOf(node) ?? '';
      if (/\*$|^(Ptr|std::shared_ptr)</.test(ret)) return true;
      if (node.arguments.some(arg => this.IsToken(arg)) && node.expression.expression.kind !== ts.SyntaxKind.ThisKeyword) {
        const owner = this.checker.getNonNullableType(this.checker.getTypeAtLocation(node.expression.expression)).symbol?.name;
        const overloads = owner ? this.index.Methods(owner).get(node.expression.name.text)?.overloads ?? [] : [];
        if (overloads.some(item => /^(Ptr|std::shared_ptr)</.test(item.ret) || (item.isTemplate && /\*$/.test(item.ret)))) return true;
      }
    }
    if (this.markPointerNodes?.has(node)) return true;
    if (ts.isOptionalChain(node) && ts.isElementAccessExpression(node) && this.checker.isArrayType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(node.expression)))) return true;
    // a visual: held by Ptr
    if (this.IsVisualType(this.checker.getTypeAtLocation(node)) && node.kind !== ts.SyntaxKind.ThisKeyword
      && !(ts.isCallExpression(node))) return true;
    if (ts.isIdentifier(node)) {
      const symbol = this.checker.getSymbolAtLocation(node);
      if (this.pointers.has(symbol)) return true;
      // a parameter that is an element or null
      const declaration = symbol?.valueDeclaration;
      if (declaration && ts.isParameter(declaration) && declaration.type && ts.isUnionTypeNode(declaration.type)
        && this.IsElementType(this.checker.getTypeFromTypeNode(declaration.type))) return true;
      return false;
    }

    // an element of an array of elements
    if (ts.isElementAccessExpression(node) && this.checker.isArrayType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(node.expression)))
      && this.IsElementType(this.checker.getTypeAtLocation(node))) return true;
    if (ts.isPropertyAccessExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ThisKeyword && this.pointerFields.has(node.name.text)) return true;
      const ownerName = node.expression.kind === ts.SyntaxKind.ThisKeyword ? this.className : this.OwnerName(node.expression);
      const field = ownerName ? this.index.FieldType(ownerName, node.name.text) : null;
      if (field && /^(Ptr|std::shared_ptr)<|\*$/.test(field)) return true;
    }
    return false;
  }

  /** Whether an expression is a C++ std::optional: a property typed T | null. */
  IsOptional(node) {
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    if (this.IsTweenType(this.checker.getTypeAtLocation(node))) return false;
    if (ts.isConditionalExpression(node)) return this.IsOptional(node.whenTrue) && this.IsOptional(node.whenFalse);
    if (ts.isIdentifier(node)) return this.optionals.has(this.checker.getSymbolAtLocation(node));
    if (ts.isCallExpression(node)) {
      if (this.IsPointer(node)) return false;
      const type = this.checker.getTypeAtLocation(node);
      return type.isUnion() && type.types.some(item => item.flags & ts.TypeFlags.Null);
    }
    if (ts.isPropertyAccessExpression(node)) {
      // a field of the class: the type the translation gives it
      if (node.expression.kind === ts.SyntaxKind.ThisKeyword && this.fieldTypes?.get(node.name.text)) return /^std::optional</.test(this.fieldTypes.get(node.name.text));
      // the C++ field's type, when C++ declares it
      const ownerName = this.OwnerName(node.expression);
      const cppField = ownerName ? this.index.FieldType(ownerName, node.name.text) : null;
      if (cppField) return /^std::optional</.test(cppField);
      const symbol = this.checker.getSymbolAtLocation(node);
      if (symbol && symbol.flags & ts.SymbolFlags.Optional) return true;
      const declaration = symbol?.valueDeclaration;
      if (declaration && (ts.isPropertyDeclaration(declaration) || ts.isPropertySignature(declaration))) {
        if (declaration.questionToken) return true;
        if (!declaration.type || !ts.isUnionTypeNode(declaration.type)) return false;
        return declaration.type.types.some(item => (item.kind === ts.SyntaxKind.LiteralType && item.literal.kind === ts.SyntaxKind.NullKeyword)
          || item.kind === ts.SyntaxKind.UndefinedKeyword);
      }
    }
    return false;
  }

  /** A call of a method of a browser game class that C++ declares without that method, whose body returns one
   * expression: that expression, of the call's object and arguments. */
  InlineMethod(node, chain) {
    const callee = node.expression;
    const ownerType = this.checker.getNonNullableType(this.checker.getTypeAtLocation(callee.expression));
    const ownerName = ownerType.symbol?.name;
    if (!ownerName || !this.index.Has(ownerName) || this.index.Methods(ownerName).has(callee.name.text)) return null;
    const declaration = this.checker.getResolvedSignature(node)?.getDeclaration();
    if (!declaration || !ts.isMethodDeclaration(declaration) || !declaration.body || declaration.body.statements.length !== 1) return null;
    if (!/\/(alpha_family|plugins)\//.test(declaration.getSourceFile().fileName)) return null;
    const statement = declaration.body.statements[0];
    if (!ts.isReturnStatement(statement) || !statement.expression) return null;
    const receiver = this.Expr(callee.expression, chain);
    const pointer = this.IsPointer(callee.expression);
    const savedThis = this.thisReplacement;
    const savedFile = this.sourceFile;
    this.thisReplacement = pointer ? `(*${receiver})` : receiver;
    this.sourceFile = declaration.getSourceFile();
    const symbols = declaration.parameters.map(param => this.checker.getSymbolAtLocation(param.name));
    node.arguments.forEach((arg, i) => this.renames.set(symbols[i], `(${this.Expr(arg, chain)})`));
    try {
      return `(${this.Expr(statement.expression)})`;
    } finally {
      for (const symbol of symbols) this.renames.delete(symbol);
      this.thisReplacement = savedThis;
      this.sourceFile = savedFile;
    }
  }

  /** The declaration of a function another module of the browser game exports, which C++ does not have. */
  ImportedFunction(identifier) {
    let symbol = this.checker.getSymbolAtLocation(identifier);
    if (!symbol || !(symbol.flags & ts.SymbolFlags.Alias)) return null;
    symbol = this.checker.getAliasedSymbol(symbol);
    const declaration = symbol.valueDeclaration;
    if (!declaration || !ts.isFunctionDeclaration(declaration) || !declaration.body) return null;
    if (!/\/(alpha_family|plugins)\//.test(declaration.getSourceFile().fileName)) return null;
    return declaration;
  }

  /** An identifier's name where it is declared: an import renamed with `as` is the name it imports. */
  OriginalName(node) {
    const symbol = this.checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) return this.checker.getAliasedSymbol(symbol).name;
    return node.text;
  }

  /** The value of a constant another module of the browser game declares (a string or a number), or null. */
  ImportedConstant(node) {
    const symbol = this.checker.getSymbolAtLocation(node);
    if (!symbol || !(symbol.flags & ts.SymbolFlags.Alias)) return null;
    const declaration = this.checker.getAliasedSymbol(symbol).valueDeclaration;
    if (!declaration || !ts.isVariableDeclaration(declaration) || !(declaration.parent.flags & ts.NodeFlags.Const) || !declaration.initializer) return null;
    if (this.index.Has(this.OriginalName(node))) return null;
    const init = declaration.initializer;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return JSON.stringify(init.text);
    if (ts.isNumericLiteral(init)) return init.text;
    return null;
  }

  /** The C++ name of a token: IX, IX::Events, a data class. */
  TokenName(node) {
    if (ts.isIdentifier(node)) {
      const renamed = this.tokenRenames.get(this.checker.getSymbolAtLocation(node));
      if (renamed) return renamed;
      const original = this.OriginalName(node);
      if (!this.index.Has(original) && !this.IsEventsName(original)) this.Fail(node, `${original}, which the C++ does not declare`);
      return this.Name(original, false, this.ModuleHint(node));
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'Events') return `${this.Name(this.OriginalName(node.expression))}::Events`;
    this.Fail(node, 'unsupported runtime token');
  }

  IsToken(node) {
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'Events') return true;
    if (!ts.isIdentifier(node)) return false;
    // a constant named after a C++ interface (IStartHwButton...)
    let declared = this.checker.getSymbolAtLocation(node);
    if (declared && declared.flags & ts.SymbolFlags.Alias) declared = this.checker.getAliasedSymbol(declared);
    if (declared && declared.flags & ts.SymbolFlags.Variable && /^I[A-Z]/.test(node.text) && this.index.Has(node.text)) return true;
    const type = this.checker.getTypeAtLocation(node);
    const name = type.aliasSymbol?.name ?? type.symbol?.name;
    if (name === 'InterfaceToken' || name === 'RuntimeToken') return true;
    let symbol = this.checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
    return !!symbol && (symbol.flags & ts.SymbolFlags.Class) !== 0 && ts.isIdentifier(node);
  }

  /** Whether an identifier names an enum or a namespace-like object: RoundType, Currency. */
  IsScope(node) {
    if (!ts.isIdentifier(node)) return false;
    let symbol = this.checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
    if (!symbol) return false;
    if (symbol.flags & ts.SymbolFlags.Enum) return true;
    if (symbol.flags & ts.SymbolFlags.Class && ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) return true;
    if (symbol.flags & ts.SymbolFlags.Variable && /^[A-Z]/.test(node.text) && this.index.Has(node.text)) return true;
    return false;
  }

  Expr(node, chain = null) {
    const expr = child => this.Expr(child, chain);
    if (chain && node === chain.replace) return chain.with;
    // a?.b as a value: (a ? a->b : the type's default)
    if (ts.isOptionalChain(node) && !(chain?.optionalRoot) && !this.IsTweenCall(node) && !(ts.isOptionalChain(node.parent) && node.parent.expression === node)
      && !(ts.isNonNullExpression(node.parent))) {
      const root = this.OptionalChainRoot(node)?.root;
      // one ?. on a pointer or an optional
      let questionDots = 0;
      let indexes = false;
      for (let item = node; item && item !== root; item = item.expression) {
        if (item.questionDotToken) questionDots++;
        if (ts.isElementAccessExpression(item)) indexes = true;
      }
      // record?.[k] of a map C++ has as a plain map: the value, or the value type's default
      if (indexes && ts.isElementAccessExpression(node) && node.questionDotToken && questionDots === 1 && root === node.expression
        && this.DeclaredRecordType(node.expression)) {
        const map = this.Expr(node.expression, chain);
        const key = this.Expr(node.argumentExpression, chain);
        const valueType = this.CppType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(node)), node);
        return `(${map}.contains(${key}) ? ${map}.at(${key}) : ${valueType}{})`;
      }
      // a chain of fields and array elements: a pointer to its end, null when an index is not valid
      if (indexes) {
        const pointer = this.CheckedElementPointer(node, chain);
        if (pointer) return pointer;
      }
      // an element of an array in the chain: TypeScript has undefined where C++ needs its index checked
      if (indexes) this.Fail(node, 'an optional chain through an array element (check the index with IsValidIndex, as C++ does)');
      if (root && !(chain && chain.replace === root) && questionDots === 1 && (this.IsPointer(root) || this.IsOptional(root))) {
        const rootText = this.Expr(root, chain);
        const value = this.Expr(node, { ...(chain ?? {}), replace: root, with: rootText, pointerRoot: true, optionalRoot: true });
        const type = this.checker.getTypeAtLocation(node);
        const nonNull = this.checker.getNonNullableType(type);
        let fallback;
        if (nonNull.flags & ts.TypeFlags.BooleanLike) fallback = 'false';
        else if (nonNull.flags & ts.TypeFlags.NumberLike) fallback = '0';
        else if (nonNull.flags & ts.TypeFlags.StringLike) fallback = 'std::string{}';
        else if (this.IsPointer(node)) fallback = 'nullptr';
        else fallback = `std::remove_cvref_t<decltype(${value})>{}`;
        return `(${rootText} ? ${value} : ${fallback})`;
      }
    }
    switch (node.kind) {
      case ts.SyntaxKind.NumericLiteral:
        return node.text;
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        return JSON.stringify(node.text);
      case ts.SyntaxKind.TrueKeyword:
        return 'true';
      case ts.SyntaxKind.FalseKeyword:
        return 'false';
      case ts.SyntaxKind.NullKeyword:
        return 'std::nullopt';
      case ts.SyntaxKind.ThisKeyword:
        return this.thisReplacement ?? '(*this)';
      default:
        break;
    }
    if (ts.isIdentifier(node)) {
      if (node.text === 'undefined') return 'nullptr';
      const renamed = this.renames.get(this.checker.getSymbolAtLocation(node));
      if (renamed) return renamed;
      if (this.IsScope(node) || this.IsToken(node)) return this.Name(this.OriginalName(node), false, this.ModuleHint(node));
      // a constant of another TypeScript module: its value
      const imported = this.ImportedConstant(node);
      if (imported !== null) return imported;
      if (this.inHeader) {
        const declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
        const init = declaration && ts.isVariableDeclaration(declaration) && declaration.parent.parent && ts.isVariableStatement(declaration.parent.parent)
          && declaration.parent.parent.parent === this.sourceFile ? declaration.initializer : null;
        if (init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) return JSON.stringify(init.text);
        if (init && ts.isNumericLiteral(init)) return init.text;
      }
      if (this.IsOptional(node) && this.IsNarrowedValue(node)) return `${node.text}.value()`;
      // a pointer narrowed to its object, used as a value (an argument, a returned value): *p
      if (this.pointers.has(this.checker.getSymbolAtLocation(node)) && this.IsNarrowedValue(node) && this.IsValueUse(node)
        && !this.IsVisualType(this.checker.getTypeAtLocation(node))) return `(*${node.text})`;
      return node.text;
    }
    if (ts.isParenthesizedExpression(node)) return `(${expr(node.expression)})`;
    if (ts.isVoidExpression(node)) return expr(node.expression);
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression?.(node)) return expr(node.expression);
    if (ts.isNonNullExpression(node)) {
      const inner = expr(node.expression);
      if (this.IsPointer(node.expression)) return `(*${inner})`;
      if (this.IsOptional(node.expression)) return `${inner}.value()`;
      return inner;
    }
    if (ts.isPrefixUnaryExpression(node)) {
      // !arr[i]: the index is not valid
      if (node.operator === ts.SyntaxKind.ExclamationToken && ts.isElementAccessExpression(node.operand)
        && this.checker.isArrayType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(node.operand.expression)))) {
        this.UseHeader('IsValidIndex');
        return `!GameCore::IsValidIndex(${expr(node.operand.expression)}, ${expr(node.operand.argumentExpression)})`;
      }
      if (node.operator === ts.SyntaxKind.ExclamationToken) {
        const operandType = this.checker.getTypeAtLocation(node.operand);
        if (this.IsTweenType(operandType)) return `!${expr(node.operand)}.is_valid()`;
        const nonNullOperand = this.checker.getNonNullableType(operandType);
        if (nonNullOperand.flags & ts.TypeFlags.StringLike && !this.IsOptional(node.operand) && !this.pointers.has(this.checker.getSymbolAtLocation(node.operand))) return `${expr(node.operand)}.empty()`;
        const truth = this.Truthiness(node.operand, chain);
        if (truth) return `!(${truth})`;
      }
      return `${ts.tokenToString(node.operator)}${expr(node.operand)}`;
    }
    if (ts.isPostfixUnaryExpression(node)) return `${expr(node.operand)}${ts.tokenToString(node.operator)}`;
    if (ts.isConditionalExpression(node)) {
      const choice = this.InstanceOfChoice(node);
      if (choice) {
        this.includes.add('variant');
        return `std::get_if<${this.Name(choice.type)}>(&${expr(choice.value)})`;
      }
      const narrowed = this.InstanceOf(node.condition);
      const branch = item => {
        if (item.kind === ts.SyntaxKind.NullKeyword && /\*$/.test(this.returnType ?? '')) return 'nullptr';
        if (ts.isArrayLiteralExpression(item) || ts.isObjectLiteralExpression(item)) return `${this.CppType(this.checker.getTypeAtLocation(node), node)}${expr(item)}`;
        // x instanceof T ? x.f : null, in a method that returns a pointer: &std::get<T>(x).f
        if (narrowed && item === node.whenTrue && /\*$/.test(this.returnType ?? '') && node.whenFalse.kind === ts.SyntaxKind.NullKeyword) {
          this.renames.set(narrowed.symbol, `std::get<${this.Name(narrowed.type)}>(${narrowed.name})`);
          const text = `&${expr(item)}`;
          this.renames.delete(narrowed.symbol);
          return text;
        }
        return expr(item);
      };
      return `${this.Condition(node.condition)} ? ${branch(node.whenTrue)} : ${branch(node.whenFalse)}`;
    }
    if (ts.isBinaryExpression(node)) return this.Binary(node, chain);
    if (ts.isTemplateExpression(node)) {
      this.includes.add('fmt/format.h');
      let format = node.head.text.replace(/[{}]/g, match => match + match);
      const args = [];
      for (const span of node.templateSpans) {
        format += `{}${span.literal.text.replace(/[{}]/g, match => match + match)}`;
        args.push(expr(span.expression));
      }
      return `fmt::format(${JSON.stringify(format)}, ${args.join(', ')})`;
    }
    if (ts.isPropertyAccessExpression(node)) return this.PropertyAccess(node, chain);
    if (ts.isElementAccessExpression(node)) {
      this.UnhandledOptional(node, chain);
      // record[k] of a Record (a std::map): the value, or the value type's default
      const recordType = this.checker.getNonNullableType(this.checker.getTypeAtLocation(node.expression));
      if (!this.checker.isArrayType(recordType) && !this.checker.isTupleType(recordType) && !(recordType.flags & ts.TypeFlags.StringLike) && recordType.symbol?.name !== 'Map'
        && (recordType.aliasSymbol?.name === 'Record' || recordType.aliasSymbol?.name === 'Partial' || recordType.getStringIndexType() || recordType.getNumberIndexType()
          || this.DeclaredRecord(node.expression))) {
        const map = expr(node.expression);
        const key = expr(node.argumentExpression);
        const valueType = this.CppType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(node)), node);
        return `(${map}.contains(${key}) ? ${map}.at(${key}) : ${valueType}{})`;
      }
      return `${expr(node.expression)}[${expr(node.argumentExpression)}]`;
    }
    if (ts.isCallExpression(node)) return this.Call(node, chain);
    if (ts.isNewExpression(node) && ['Map', 'Set'].includes(node.expression.getText())) {
      // an initializer list of the map or set the declaration says: {{k, v}, ...} or {a, b}
      const items = node.arguments?.[0];
      const typeArgs = (node.typeArguments ?? []).map(arg => this.CppTypeNode(arg));
      const typed = typeArgs.length && typeArgs.every(Boolean)
        ? (node.expression.getText() === 'Map' ? `std::map<${typeArgs[0]}, ${typeArgs[1]}>` : `std::set<${typeArgs[0]}>`) : null;
      if (!items) return typed ? `${typed}{}` : '{}';
      if (!ts.isArrayLiteralExpression(items)) return expr(items);
      return `{${items.elements.map(item => (ts.isArrayLiteralExpression(item) ? `{${item.elements.map(expr).join(', ')}}` : expr(item))).join(', ')}}`;
    }
    if (ts.isNewExpression(node) && this.IsVisualType(this.checker.getTypeAtLocation(node))) {
      this.includes.add('memory');
      return `std::make_shared<${this.Name(node.expression.getText())}>(${(node.arguments ?? []).map(expr).join(', ')})`;
    }
    if (ts.isNewExpression(node)) {
      const type = this.Name(node.expression.getText());
      const args = (node.arguments ?? []).map(expr);
      return args.length ? `${type}(${args.join(', ')})` : `${type}{}`;
    }
    if (ts.isObjectLiteralExpression(node)) return this.ObjectLiteral(node, chain);
    if (ts.isArrayLiteralExpression(node)) {
      // [...c]: a copy of c
      if (node.elements.length === 1 && ts.isSpreadElement(node.elements[0])) return expr(node.elements[0].expression);
      // [...a, ...b, c]: their concatenation
      if (node.elements.some(item => ts.isSpreadElement(item))) {
        const element = this.CppType(this.checker.getTypeArguments(this.checker.getTypeAtLocation(node))[0], node);
        const parts = node.elements.map(item => (ts.isSpreadElement(item)
          ? `{ auto&& part_ = ${expr(item.expression)}; result_.insert(result_.end(), part_.begin(), part_.end()); }`
          : `result_.push_back(${expr(item)});`));
        return `[&] { std::vector<${element}> result_; ${parts.join(' ')} return result_; }()`;
      }
      return `{${node.elements.map(expr).join(', ')}}`;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      let params = node.parameters.map(param => `auto&& ${param.name.getText()}`).join(', ');
      // an array method's callback that takes none of its arguments
      if (!node.parameters.length && ts.isCallExpression(node.parent) && ts.isPropertyAccessExpression(node.parent.expression)
        && this.checker.isArrayType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(node.parent.expression.expression)))) params = 'auto&&...';
      // a callback a method keeps (InitElementsList's, an event's): it captures by value
      const call = ts.isCallExpression(node.parent) && node.parent.arguments.includes(node) ? node.parent : null;
      const callOwner = call && ts.isPropertyAccessExpression(call.expression) ? this.checker.getNonNullableType(this.checker.getTypeAtLocation(call.expression.expression)) : null;
      const synchronous = !call || call.expression.getText() === 'Array.from'
        || (callOwner && (this.checker.isArrayType(callOwner) || ['Map', 'Set'].includes(callOwner.symbol?.name)));
      let usesThis = false;
      const visit = item => {
        if (item.kind === ts.SyntaxKind.ThisKeyword) usesThis = true;
        ts.forEachChild(item, visit);
      };
      visit(node.body);
      const capture = this.atModule ? '' : synchronous || this.inFunction ? '&' : usesThis ? '=, this' : '=';
      if (ts.isBlock(node.body)) return `[${capture}](${params}) ${this.Block(node.body, 3)}`;
      const returnsVoid = this.checker.getSignatureFromDeclaration(node)?.getReturnType().flags & ts.TypeFlags.Void;
      if (returnsVoid && ts.isCallExpression(node.body)) return `[${capture}](${params}) {\n${this.ExpressionStatement(node.body, I.repeat(4))}\n${I}${I}${I}}`;
      return returnsVoid ? `[${capture}](${params}) { ${expr(node.body)}; }` : `[${capture}](${params}) { return ${expr(node.body)}; }`;
    }
    this.Fail(node, `unsupported expression ${ts.SyntaxKind[node.kind]}`);
  }

  Binary(node, chain) {
    const expr = child => this.Expr(child, chain);
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken) return this.Coalesce(node.left, expr(node.right), chain, node);
    if (op === ts.SyntaxKind.InstanceOfKeyword) {
      this.includes.add('variant');
      return `std::holds_alternative<${this.Name(node.right.getText())}>(${expr(node.left)})`;
    }
    const map = {
      [ts.SyntaxKind.EqualsEqualsEqualsToken]: '==', [ts.SyntaxKind.ExclamationEqualsEqualsToken]: '!=',
      [ts.SyntaxKind.EqualsEqualsToken]: '==', [ts.SyntaxKind.ExclamationEqualsToken]: '!=',
    };
    if (op === ts.SyntaxKind.EqualsToken && node.right.kind === ts.SyntaxKind.NullKeyword && this.IsPointer(node.left)) return `${expr(node.left)} = nullptr`;
    if (op === ts.SyntaxKind.EqualsToken && this.IsPointer(node.left) && this.IsElementType(this.checker.getTypeAtLocation(node.right)) && node.right.kind !== ts.SyntaxKind.NullKeyword) {
      if (!this.IsPointer(node.right)) return `${expr(node.left)} = &${expr(node.right)}`;
      if (/^(Ptr|std::shared_ptr)</.test(this.CppReturnOf(node.right) ?? '') || this.SharedPointerCall(node.right)) return `${expr(node.left)} = ${expr(node.right)}.get()`;
    }
    if (op === ts.SyntaxKind.EqualsToken && node.right.kind === ts.SyntaxKind.NullKeyword && this.IsTweenType(this.checker.getTypeAtLocation(node.left))) return `${expr(node.left)} = {}`;
    if (op === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'length'
      && this.checker.isArrayType(this.checker.getTypeAtLocation(node.left.expression))) {
      return `${expr(node.left.expression)}.resize(${expr(node.right)})`;
    }
    const text = map[op] ?? ts.tokenToString(op);
    // arithmetic on an enum class: on its integer, back to the enum
    if ([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(op)) {
      const isEnum = type => (type.flags & ts.TypeFlags.EnumLike) || (type.isUnion() && type.types.every(item => item.flags & ts.TypeFlags.EnumLiteral));
      const enumType = [node.left, node.right].map(side => this.checker.getTypeAtLocation(side)).find(isEnum);
      if (enumType) {
        const enumName = this.CppType(enumType, node);
        const asInt = side => (isEnum(this.checker.getTypeAtLocation(side)) ? `int(${expr(side)})` : expr(side));
        return `${enumName}(${asInt(node.left)} ${text} ${asInt(node.right)})`;
      }
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
      // a value, not a condition (n || d): TypeScript's is the operand's value, C++'s a bool
      const resultType = this.checker.getNonNullableType(this.checker.getTypeAtLocation(node));
      const isCondition = !this.IsValueUse(node) || (resultType.flags & ts.TypeFlags.BooleanLike)
        || (resultType.isUnion() && resultType.types.every(item => item.flags & ts.TypeFlags.BooleanLike));
      if (!isCondition) {
        if (op === ts.SyntaxKind.AmpersandAmpersandToken) this.Fail(node, 'a value of && (write it with a conditional)');
        const left = this.Truthiness(node.left, chain) ?? expr(node.left);
        return `[&] { auto&& left_ = ${expr(node.left)}; return ${left === expr(node.left) ? 'left_' : `(${left})`} ? left_ : ${expr(node.right)}; }()`;
      }
      const side = item => this.Truthiness(item, chain) ?? expr(item);
      return `${side(node.left)} ${text} ${side(node.right)}`;
    }
    // a?.[i] === x (an index-checked element compared with a value): whether there is the element and it is x
    if ([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(op)) {
      const isChecked = item => ts.isOptionalChain(item) && ts.isElementAccessExpression(item);
      const checked = isChecked(node.left) ? node.left : isChecked(node.right) ? node.right : null;
      const other = checked === node.left ? node.right : node.left;
      if (checked && other.kind !== ts.SyntaxKind.NullKeyword && !(ts.isIdentifier(other) && other.text === 'undefined')) {
        const equal = `[&] { auto element_ = ${expr(checked)}; return element_ != nullptr && *element_ == ${expr(other)}; }()`;
        return op === ts.SyntaxKind.EqualsEqualsEqualsToken ? equal : `!${equal}`;
      }
    }
    // x === undefined / null, of an optional or a pointer
    const isNothing = item => item.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(item) && item.text === 'undefined');
    if ([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(op)
      && (isNothing(node.left) || isNothing(node.right))) {
      const value = isNothing(node.left) ? node.right : node.left;
      const equal = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken;
      if (this.IsOptional(value)) return `${equal ? '!' : ''}${expr(value)}.has_value()`;
      return `${expr(value)} ${equal ? '==' : '!='} nullptr`;
    }
    // % of a fractional value (a time in ms): std::fmod
    if (op === ts.SyntaxKind.PercentToken && (this.IsFractional(node.left) || this.IsFractional(node.right))) {
      this.includes.add('cmath');
      return `std::fmod(${expr(node.left)}, ${expr(node.right)})`;
    }
    // a comparison with a container's size or a C++ unsigned value: both sides as int64_t
    const isSize = side => (ts.isPropertyAccessExpression(side) && ['length', 'size'].includes(side.name.text))
      || /^(size_t|unsigned|uint\d+_t)$/.test(this.CppReturnOf(side) ?? '')
      || (ts.isIdentifier(side) && this.unsignedParams?.has(side.text));
    const relational = [ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(op);
    if (relational && (isSize(node.left) || isSize(node.right))) {
      const isLength = side => ts.isPropertyAccessExpression(side) && ['length', 'size'].includes(side.name.text);
      const wrap = side => (isLength(side) ? expr(side) : `int64_t(${expr(side)})`);
      return `${wrap(node.left)} ${text} ${wrap(node.right)}`;
    }
    if (op === ts.SyntaxKind.BarBarEqualsToken || op === ts.SyntaxKind.AmpersandAmpersandEqualsToken) {
      const left = expr(node.left);
      return `${left} = ${left} ${op === ts.SyntaxKind.BarBarEqualsToken ? '||' : '&&'} ${this.Truthiness(node.right, chain) ?? expr(node.right)}`;
    }
    if (op === ts.SyntaxKind.QuestionQuestionEqualsToken) this.Fail(node, 'logical assignment ??=');
    return `${expr(node.left)} ${text} ${expr(node.right)}`;
  }

  /** Whether a number is fractional in C++: performance.now(), a division, or a variable of one. */
  IsFractional(node, depth = 0) {
    if (depth > 6) return false;
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    if (ts.isCallExpression(node) && node.expression.getText() === 'performance.now') return true;
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.SlashToken) return true;
      if ([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken].includes(node.operatorToken.kind)) {
        return this.IsFractional(node.left, depth + 1) || this.IsFractional(node.right, depth + 1);
      }
    }
    if (ts.isConditionalExpression(node)) return this.IsFractional(node.whenTrue, depth + 1) || this.IsFractional(node.whenFalse, depth + 1);
    if (ts.isIdentifier(node)) {
      const declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) return this.IsFractional(declaration.initializer, depth + 1);
    }
    return false;
  }

  /** The name of an expression's type, through Required<T>, Partial<T>, Readonly<T>. */
  OwnerName(node) {
    const type = this.checker.getNonNullableType(this.checker.getTypeAtLocation(node));
    if (['Required', 'Partial', 'Readonly'].includes(type.aliasSymbol?.name) && type.aliasTypeArguments?.length === 1) {
      return type.aliasTypeArguments[0].aliasSymbol?.name ?? type.aliasTypeArguments[0].symbol?.name;
    }
    return type.aliasSymbol?.name ?? type.symbol?.name;
  }

  /** The C++ type of the parameter an argument is passed to, when C++ declares the method or function. */
  CppParamTypeOf(arg) {
    const call = arg.parent;
    if (!call || !ts.isCallExpression(call)) return null;
    const index = call.arguments.indexOf(arg);
    let params = null;
    if (ts.isPropertyAccessExpression(call.expression)) {
      const owner = call.expression.expression.kind === ts.SyntaxKind.ThisKeyword ? this.className
        : this.checker.getNonNullableType(this.checker.getTypeAtLocation(call.expression.expression)).symbol?.name;
      params = owner ? this.index.Methods(owner).get(call.expression.name.text)?.params : null;
    } else if (ts.isIdentifier(call.expression)) {
      params = this.index.functionParams.get(call.expression.text) ?? null;
    }
    return params ? cppParams(params)[index]?.type ?? null : null;
  }

  /** Whether a C++ type is the TypeScript's, with another integer width, pointer kind, reference or constness. */
  SameType(cpp, derived) {
    const normalize = text => text.replace(/\bconst\b|&/g, '').replace(/\s+/g, '').replace(/\b(int64_t|int32_t|int|unsigned|uint32_t|uint64_t|size_t)\b/g, 'INT')
      .replace(/^(Ptr<(.*)>|std::optional<(.*)>|(.*)\*)$/, 'PTR<$2$3$4>').replace(/(^|[<,])States::/g, '$1').replace(/std::string_view/g, 'std::string');
    return normalize(cpp) === normalize(derived);
  }

  /** Whether a call returns a shared pointer: a template call of a method whose template overloads return Ptr<T>. */
  SharedPointerCall(node) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
    const owner = this.checker.getNonNullableType(this.checker.getTypeAtLocation(node.expression.expression)).symbol?.name;
    const overloads = owner ? this.index.Methods(owner).get(node.expression.name.text)?.overloads ?? [] : [];
    return overloads.length > 0 && overloads.every(item => /^(Ptr|std::shared_ptr)</.test(item.ret));
  }

  /** A call's C++ return type, by the C++ declaration of its method. */
  CppReturnOf(node) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
    const owner = node.expression.expression;
    const ownerName = owner.kind === ts.SyntaxKind.ThisKeyword ? this.className : this.checker.getTypeAtLocation(owner).symbol?.name;
    const ret = ownerName ? this.index.Methods(ownerName).get(node.expression.name.text)?.ret : null;
    return ret?.replace(/\bconst\b|&/g, '').trim() ?? null;
  }

  /** The element type of a vector a lambda builds: the returned type's, when it is returned. */
  VectorElement(node, fallback) {
    let parent = node.parent;
    let child = node;
    while (parent && ts.isParenthesizedExpression(parent)) {
      child = parent;
      parent = parent.parent;
    }
    const expand = text => {
      let current = (text ?? '').replace(/^const\s+|&$/g, '').trim();
      for (let depth = 0; depth < 5 && this.index.aliases.has(current.split('::').pop()); depth++) current = this.index.aliases.get(current.split('::').pop());
      return current;
    };
    const vector = text => /^std::vector<(.*)>$/.exec(expand(text));
    // where the vector goes: what is returned, the field it is assigned to, the C++ parameter it is passed to
    const returned = parent && ts.isReturnStatement(parent) ? vector(this.returnType) : null;
    if (returned) return returned[1];
    if (parent && ts.isBinaryExpression(parent) && parent.right === child && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(parent.left) && parent.left.expression.kind === ts.SyntaxKind.ThisKeyword) {
      const field = vector(this.fieldTypes?.get(parent.left.name.text));
      if (field) return field[1];
      if (this.fieldTypes?.get(parent.left.name.text)) return `std::remove_cvref_t<decltype(${parent.left.name.text})>::value_type`;
    }
    if (parent && ts.isCallExpression(parent) && parent.arguments.includes(child)) {
      const param = vector(this.CppParamTypeOf(child));
      if (param) return this.QualifyCppType(param[1]);
    }
    return fallback();
  }

  /** left ?? fallback: what left is in C++ when it has a value, else the fallback. */
  Coalesce(leftNode, fallback, chain, node) {
    const expr = child => this.Expr(child, chain);
    let left = leftNode;
    const right = node && ts.isBinaryExpression(node) ? node.right : null;
    if (right && right.kind === ts.SyntaxKind.NullKeyword && this.IsElementType(this.checker.getTypeAtLocation(leftNode))) fallback = 'nullptr';
    if (right && ((ts.isArrayLiteralExpression(right) && !right.elements.length) || (ts.isObjectLiteralExpression(right) && !right.properties.length))) {
      fallback = `${this.CppType(this.checker.getNonNullableType(this.checker.getTypeAtLocation(leftNode)), leftNode)}{}`;
    }
    while (ts.isParenthesizedExpression(left)) left = left.expression;
    // (a ?? b) ?? c is a ?? (b ?? c)
    if (ts.isBinaryExpression(left) && left.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      return this.Coalesce(left.left, this.Coalesce(left.right, fallback, chain, node), chain, node);
    }
    // arr[i] ?? d: the element, if the index is valid
    if (ts.isElementAccessExpression(left) && this.checker.isArrayType(this.checker.getTypeAtLocation(left.expression))) {
      const container = expr(left.expression);
      this.UseHeader('IsValidIndex');
      return `(GameCore::IsValidIndex(${container}, ${expr(left.argumentExpression)}) ? ${container}[${expr(left.argumentExpression)}] : ${fallback})`;
    }
    if (ts.isCallExpression(left) && ts.isPropertyAccessExpression(left.expression)) {
      const method = left.expression.name.text;
      const owner = left.expression.expression;
      const ownerType = this.checker.getTypeAtLocation(owner);
      // c.find(p) ?? d, and [...c].reverse().find(p) ?? d: the first (last) element p matches
      if (method === 'find' && this.checker.isArrayType(ownerType)) {
        this.includes.add('algorithm');
        let range = owner;
        let reversed = false;
        if (ts.isCallExpression(range) && ts.isPropertyAccessExpression(range.expression) && range.expression.name.text === 'reverse') {
          reversed = true;
          range = range.expression.expression;
        }
        const container = expr(range);
        const view = reversed ? `(${container} | std::views::reverse)` : container;
        if (reversed) this.includes.add('ranges');
        return `[&] { auto&& range_ = ${view}; auto it_ = std::ranges::find_if(range_, ${expr(left.arguments[0])}); return it_ != std::ranges::end(range_) ? *it_ : ${fallback}; }()`;
      }
      // m.get(k) ?? d
      if (method === 'get' && ownerType.symbol?.name === 'Map') {
        const map = expr(owner);
        const key = expr(left.arguments[0]);
        return `(${map}.contains(${key}) ? ${map}.at(${key}) : ${fallback})`;
      }
    }
    if (this.IsPointer(left)) return `(${expr(left)} ? *${expr(left)} : ${fallback})`;
    // record[k] ?? d
    if (ts.isElementAccessExpression(left) && this.DeclaredRecord(left.expression)) {
      const map = expr(left.expression);
      const key = expr(left.argumentExpression);
      return `(${map}.contains(${key}) ? ${map}.at(${key}) : ${fallback})`;
    }
    const leftChain = this.OptionalChainRoot(left);
    if (leftChain) {
      const root = this.Expr(leftChain.root);
      return `(${root} ? ${this.Expr(left, { replace: leftChain.root, with: root, pointerRoot: true })} : ${fallback})`;
    }
    if (this.IsOptional(left)) return `${expr(left)}.value_or(${fallback})`;
    // a field TypeScript has optional and C++ has with a default (or a choice of such fields)
    const hasDefault = item => {
      while (ts.isParenthesizedExpression(item)) item = item.expression;
      if (ts.isConditionalExpression(item)) return hasDefault(item.whenTrue) && hasDefault(item.whenFalse);
      if (!ts.isPropertyAccessExpression(item)) return false;
      const ownerName = this.OwnerName(item.expression);
      const field = ownerName ? this.index.FieldType(ownerName, item.name.text) : null;
      return !!field && !/^std::optional</.test(field);
    };
    if (hasDefault(left)) return expr(left);
    this.Fail(node, '?? on a value that is not optional');
  }

  /** A ?. that no rule lowered: the translation would drop its null check. */
  UnhandledOptional(node, chain) {
    if (chain?.ignoreOptional) return;
    if (node.questionDotToken && !(chain && chain.replace === node.expression)) this.Fail(node, 'an optional chain C++ cannot say here (write it with an if)');
  }

  PropertyAccess(node, chain) {
    this.UnhandledOptional(node, chain);
    const name = node.name.text;
    if (node.expression.kind === ts.SyntaxKind.ThisKeyword && this.thisReplacement) {
      if (ts.isCallExpression(node.parent) && node.parent.expression === node && this.InlineMethod(node.parent, chain)) return null;
      return `${this.thisReplacement}.${name}`;
    }
    if (node.expression.kind === ts.SyntaxKind.ThisKeyword) {
      if (this.getters.has(name)) return `this->${name}()`;
      if (this.IsOptional(node) && this.IsNarrowedValue(node) && !(ts.isBinaryExpression(node.parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(node.parent.operatorToken.kind))) return `${name}.value()`;
      return name;
    }
    if (ts.isIdentifier(node.expression) && node.expression.text === 'ease' && this.ImportedFrom(node.expression, /\/Tools\/Tweeny\.ts$/)) {
      this.includes.add('tweeny/tween_ease.h');
      return `tweeny::ease::${name}`;
    }
    if (this.IsScope(node.expression)) return `${this.Name(node.expression.getText(), false, this.ModuleHint(node.expression))}::${name}`;
    if (name === 'Events' && this.IsToken(node)) return this.TokenName(node);
    const type = this.checker.getNonNullableType(this.checker.getTypeAtLocation(node.expression));
    // a field of every alternative of a std::variant (a parent of a call is the call's)
    if (this.IsVariant(type) && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
      this.includes.add('variant');
      return `std::visit([&](auto&& v_) -> decltype(auto) { return (v_.${name}); }, ${this.Expr(node.expression, chain)})`;
    }
    const base = this.VariantAlternative(node.expression, this.Expr(node.expression, chain));
    const member = this.IsPointer(node.expression) ? '->' : '.';
    if (name === 'length' && (this.checker.isArrayType(type) || type.flags & ts.TypeFlags.StringLike)) return `int64_t(${base}${member}size())`;
    if (name === 'size' && ['Map', 'Set'].includes(type.symbol?.name)) return `int64_t(${base}.size())`;
    const pointer = (chain?.pointerRoot && node.expression === chain.replace) || this.IsPointer(node.expression);
    const access = `${base}${pointer ? '->' : '.'}${name}`;
    if (this.IsOptional(node) && this.IsNarrowedValue(node)) return `${access}.value()`;
    return access;
  }

  Call(node, chain) {
    const expr = child => this.Expr(child, chain);
    const callee = node.expression;
    if (this.IsTweenCall(node)) return this.TweenCall(node, chain) ?? this.Fail(node, 'a tween method that has no C++');
    // Tweeny.ts's functions: tweeny's
    if (ts.isIdentifier(callee) && TWEENY_FUNCTIONS[callee.text] && this.ImportedFrom(callee, /\/Tools\/Tweeny\.ts$/)) {
      this.includes.add('tweeny/tween_core.h');
      const args = node.arguments.map(expr);
      if (callee.text === 'Delay') {
        this.includes.add('chrono');
        return `tweeny::delay(std::chrono::milliseconds(${args[0]}))`;
      }
      return `${TWEENY_FUNCTIONS[callee.text]}(${args.join(', ')})`;
    }
    // resources.GetIData<T>(id): the IData's JSON as the C++ struct T (rss::convert)
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'GetIData' && node.arguments.length === 1) {
      const typeName = node.typeArguments?.[0] && ts.isTypeReferenceNode(node.typeArguments[0]) ? node.typeArguments[0].typeName.getText()
        : this.checker.getTypeAtLocation(node).symbol?.name;
      if (!typeName || !this.index.Has(typeName)) this.Fail(node, `an IData of no C++ struct (${typeName})`);
      const type = this.Name(typeName);
      this.UseHeader('IResources');
      return `[&] { ${type} value_{}; rss::convert<${type}>(${expr(callee.expression)}.Get<rss::RssIData>(${expr(node.arguments[0])}), value_); return value_; }()`;
    }
    // super.Method(...): the base class's
    if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.SuperKeyword) {
      return `${this.baseCpp ?? this.baseName}::${callee.name.text}(${node.arguments.map(expr).join(', ')})`;
    }
    // this.RuntimeAdd(IX, this), this.RuntimeAdd(IX.Events, this.m_events)
    if (this.IsThisCall(node, 'RuntimeAdd') && node.arguments.length === 2) {
      const value = node.arguments[1];
      const pointer = value.kind === ts.SyntaxKind.ThisKeyword ? 'this' : this.IsPointer(value) ? expr(value) : `&${expr(value)}`;
      return `RuntimeAdd<${this.TokenName(node.arguments[0])}>(${pointer})`;
    }
    // this.Method(Token) -> Method<Token>()
    if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword) {
      const method = callee.name.text;
      const token = node.arguments[0];
      const constMethod = { Parent: 'ConstParent', Nvram: 'ConstNvram', Static: 'ConstStatic', RuntimeGet: 'RuntimeGetConst', RuntimeTryGet: 'RuntimeTryGetConst' };
      if (this.inConstMethod && constMethod[method] && node.arguments.length === 1) {
        return `${constMethod[method]}<${this.TokenName(token)}>()`;
      }
      if (TOKEN_METHODS.has(method) && node.arguments.length === 1 && (ts.isIdentifier(token) || (ts.isPropertyAccessExpression(token) && token.name.text === 'Events'))
        && !(method === 'TransitLater' && !this.IsToken(token) && !ts.isIdentifier(token))) {
        return `${method}<${this.TokenName(node.arguments[0])}>()`;
      }
      if ((method === 'Transit' || method === 'TransitLater') && node.arguments.length === 1 && ts.isConditionalExpression(node.arguments[0])) {
        const choice = node.arguments[0];
        const branch = target => (this.IsToken(target) ? `${method}<${this.TokenName(target)}>()` : this.Expr(target, chain));
        if (method === 'TransitLater') return `TransitLater(${this.Expr(choice.condition, chain)} ? Transit<${this.TokenName(choice.whenTrue)}>() : Transit<${this.TokenName(choice.whenFalse)}>())`;
        return `(${this.Expr(choice.condition, chain)} ? ${branch(choice.whenTrue)} : ${branch(choice.whenFalse)})`;
      }
      if (method === 'ReactOn' && node.arguments.length === 2) {
        const handler = node.arguments[1];
        if (ts.isPropertyAccessExpression(handler) && handler.expression.kind === ts.SyntaxKind.ThisKeyword) {
          return `ReactOn(${expr(node.arguments[0])}, &${this.className}::${handler.name.text})`;
        }
        this.Fail(node, 'ReactOn with a handler that is not a method');
      }
    }
    if (ts.isPropertyAccessExpression(callee) && callee.expression.getText() === 'Array' && callee.name.text === 'from'
      && node.arguments.length === 2 && ts.isObjectLiteralExpression(node.arguments[0])) {
      const length = node.arguments[0].properties.find(property => property.name?.getText() === 'length');
      if (!length || !ts.isPropertyAssignment(length)) this.Fail(node, 'Array.from of no length');
      const element = this.VectorElement(node, () => this.CppType(this.checker.getTypeArguments(this.checker.getTypeAtLocation(node))[0], node));
      return `[&] { std::vector<${element}> result_; for (int64_t i_ = 0; i_ < int64_t(${expr(length.initializer)}); ++i_) result_.push_back((${expr(node.arguments[1])})(0, i_)); return result_; }()`;
    }
    // Object.assign(new X(), a, { f: v }): a copy of a (or a new X) with its fields set
    if (ts.isPropertyAccessExpression(callee) && callee.getText() === 'Object.assign' && node.arguments.length >= 2 && ts.isNewExpression(node.arguments[0])) {
      const type = this.Name(node.arguments[0].expression.getText());
      const sources = node.arguments.slice(1);
      const copy = sources.length && !ts.isObjectLiteralExpression(sources[0]) ? expr(sources.shift()) : `${type}{}`;
      const assignments = sources.flatMap(source => {
        if (!ts.isObjectLiteralExpression(source)) this.Fail(source, 'Object.assign of more than one object');
        return source.properties.map(property => {
          if (ts.isShorthandPropertyAssignment(property)) return `value_.${property.name.text} = ${property.name.text}; `;
          if (!ts.isPropertyAssignment(property)) this.Fail(property, 'Object.assign of a spread or method');
          return `value_.${property.name.getText()} = ${expr(property.initializer)}; `;
        });
      });
      return `[&] { ${type} value_ = ${copy}; ${assignments.join('')}return value_; }()`;
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      const owner = callee.expression;
      const ownerType = this.checker.getNonNullableType(this.checker.getTypeAtLocation(owner));
      const args = node.arguments.map(expr);
      if (owner.getText() === 'performance' && method === 'now') {
        this.includes.add('chrono');
        return 'std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count()';
      }
      if (owner.getText() === 'Math') {
        if (method === 'min' || method === 'max') {
          if (args.length === 2) return `std::${method}<std::common_type_t<decltype(${args[0]}), decltype(${args[1]})>>(${args[0]}, ${args[1]})`;
          return `std::${method}<int64_t>({${args.join(', ')}})`;
        }
        if (method === 'trunc' || method === 'floor') return `int64_t(${args[0]})`;
        if (method === 'round') return `int64_t(std::llround(${args[0]}))`;
        if (method === 'ceil') return `int64_t(std::ceil(${args[0]}))`;
        if (method === 'abs') return `std::abs(${args[0]})`;
        this.Fail(node, `Math.${method}`);
      }
      if (this.checker.isArrayType(ownerType)) {
        let base = this.Expr(owner, chain);
        if (ts.isArrayLiteralExpression(owner) && base.startsWith('{')) base = `${this.CppType(ownerType, owner)}${base}`;
        this.includes.add('algorithm');
        switch (method) {
          case 'push': {
            const pushed = node.arguments[0];
            if (pushed && this.IsElementType(this.checker.getTypeAtLocation(pushed)) && !this.IsPointer(pushed)) return `${base}.push_back(&${args[0]})`;
            if (pushed && this.IsElementType(this.checker.getTypeAtLocation(pushed)) && this.SharedPointerCall(pushed)) return `${base}.push_back(${args[0]}.get())`;
            return `${base}.push_back(${args[0]})`;
          }
          case 'pop': return `${base}.pop_back()`;
          case 'sort': {
            // (a, b) => a - b and (a, b) => b - a; [...c].sort(...) sorts a copy
            const compare = node.arguments[0];
            const descending = compare && ts.isArrowFunction(compare) && compare.parameters.length === 2
              && compare.body.getText().replace(/\s/g, '') === `${compare.parameters[1].name.getText()}-${compare.parameters[0].name.getText()}`;
            const ascending = !compare || (ts.isArrowFunction(compare) && compare.parameters.length === 2
              && compare.body.getText().replace(/\s/g, '') === `${compare.parameters[0].name.getText()}-${compare.parameters[1].name.getText()}`);
            if (!ascending && !descending) this.Fail(node, 'sort with a comparator other than a - b or b - a');
            const order = descending ? ', std::ranges::greater{}' : '';
            if (ts.isArrayLiteralExpression(owner)) return `[&] { auto copy_ = ${base}; std::ranges::sort(copy_${order}); return copy_; }()`;
            return `std::ranges::sort(${base}${order})`;
          }
          case 'unshift': return `${base}.insert(${base}.begin(), ${args[0]})`;
          case 'join': {
            const separator = args[0] ?? '","';
            return `[&] { std::string result_; bool first_ = true; for (auto&& element_ : ${base}) { if (!first_) result_ += ${separator}; result_ += element_; first_ = false; } return result_; }()`;
          }
          case 'forEach': {
            const callback = node.arguments[0];
            const count = callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ? callback.parameters.length : 1;
            const callArgs = ['range_[i_]', 'i_'].slice(0, Math.min(count, 2));
            return `[&] { auto&& range_ = ${base}; for (int64_t i_ = 0; i_ < int64_t(range_.size()); ++i_) { (${args[0]})(${callArgs.join(', ')}); } }()`;
          }
          case 'slice': {
            const element = this.CppType(this.checker.getTypeArguments(ownerType)[0], node);
            const from = args[0] ?? '0';
            const to = args[1] ?? `int64_t(range_.size())`;
            void element;
            return `[&] { auto&& range_ = ${base}; const auto size_ = int64_t(range_.size()); return std::remove_cvref_t<decltype(range_)>(range_.begin() + std::clamp<int64_t>(${from}, 0, size_), range_.begin() + std::clamp<int64_t>(${to}, 0, size_)); }()`;
          }
          case 'flatMap': {
            const element = this.VectorElement(node, () => this.CppType(this.checker.getTypeArguments(this.checker.getTypeAtLocation(node))[0], node));
            return `[&] { std::vector<${element}> result_; for (auto&& element_ : ${base}) { auto&& part_ = (${args[0]})(element_); result_.insert(result_.end(), part_.begin(), part_.end()); } return result_; }()`;
          }
          case 'find': {
            const element = this.CppType(this.checker.getTypeArguments(ownerType)[0], node);
            return `[&]() -> const ${element}* { auto&& range_ = ${base}; auto it_ = std::ranges::find_if(range_, ${args[0]}); return it_ != std::ranges::end(range_) ? &*it_ : nullptr; }()`;
          }
          case 'includes': return `[&] { auto&& range_ = ${base}; return std::ranges::find(range_, ${args[0]}) != range_.end(); }()`;
          case 'some':
          case 'every': {
            const callback = node.arguments[0];
            if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && callback.parameters.length > 1) {
              const test = `(${args[0]})(range_[i_], i_)`;
              return method === 'some'
                ? `[&] { auto&& range_ = ${base}; for (int64_t i_ = 0; i_ < int64_t(range_.size()); ++i_) { if (${test}) return true; } return false; }()`
                : `[&] { auto&& range_ = ${base}; for (int64_t i_ = 0; i_ < int64_t(range_.size()); ++i_) { if (!${test}) return false; } return true; }()`;
            }
            return `std::ranges::${method === 'some' ? 'any_of' : 'all_of'}(${base}, ${args[0]})`;
          }
          case 'indexOf': return `[&] { auto&& range_ = ${base}; auto it_ = std::ranges::find(range_, ${args[0]}); return it_ != range_.end() ? int64_t(it_ - range_.begin()) : int64_t(-1); }()`;
          case 'filter': {
            const element = this.CppType(this.checker.getTypeArguments(ownerType)[0], node);
            void element;
            return `[&] { auto&& range_ = ${base}; std::remove_cvref_t<decltype(range_)> result_; std::ranges::copy_if(range_, std::back_inserter(result_), ${args[0]}); return result_; }()`;
          }
          case 'map': {
            const element = this.VectorElement(node, () => this.CppType(this.checker.getTypeArguments(this.checker.getTypeAtLocation(node))[0], node));
            const callback = node.arguments[0];
            if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && callback.parameters.length > 1) {
              return `[&] { auto&& range_ = ${base}; std::vector<${element}> result_; for (int64_t i_ = 0; i_ < int64_t(range_.size()); ++i_) { result_.push_back((${args[0]})(range_[i_], i_)); } return result_; }()`;
            }
            return `[&] { std::vector<${element}> result_; for (auto&& element_ : ${base}) { result_.push_back((${args[0]})(element_)); } return result_; }()`;
          }
          case 'findIndex': {
            const takesIndex = node.arguments[0] && (ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0])) && node.arguments[0].parameters.length > 1;
            const test = takesIndex ? `(${args[0]})(${base}[i_], i_)` : `(${args[0]})(${base}[i_])`;
            return `[&] { for (int64_t i_ = 0; i_ < int64_t(${base}.size()); ++i_) if (${test}) return i_; return int64_t(-1); }()`;
          }
          default: this.Fail(node, `array method ${method}`);
        }
      }
      if (ownerType.flags & ts.TypeFlags.StringLike) {
        const base = this.Expr(owner, chain);
        if (method === 'toLowerCase' || method === 'toUpperCase') {
          this.UseHeader('ToLower');
          return `GameCore::${method === 'toLowerCase' ? 'ToLower' : 'ToUpper'}(${base})`;
        }
        if (method === 'includes') return `${base}.contains(${args[0]})`;
        if (method === 'startsWith') return `${base}.starts_with(${args[0]})`;
        this.Fail(node, `string method ${method}`);
      }
      if (ownerType.symbol?.name === 'Map') {
        const base = this.Expr(owner, chain);
        switch (method) {
          case 'has': return `${base}.contains(${args[0]})`;
          case 'get': return `${base}.at(${args[0]})`;
          case 'set': return `${base}[${args[0]}] = ${args[1]}`;
          case 'delete': return `${base}.erase(${args[0]})`;
          case 'clear': return `${base}.clear()`;
          case 'keys':
          case 'values': {
            const [keyType, valueType] = (ownerType.typeArguments ?? this.checker.getTypeArguments(ownerType)).map(item => this.CppType(item, node));
            const part = method === 'keys' ? 'key_' : 'value_';
            return `[&] { std::vector<${method === 'keys' ? keyType : valueType}> result_; for (auto&& [key_, value_] : ${base}) result_.push_back(${part}); return result_; }()`;
          }
          default: this.Fail(node, `Map method ${method}`);
        }
      }
      if (ownerType.symbol?.name === 'Set') {
        const base = this.Expr(owner, chain);
        switch (method) {
          case 'has': return `${base}.contains(${args[0]})`;
          case 'add': return `${base}.insert(${args[0]})`;
          case 'delete': return `${base}.erase(${args[0]})`;
          case 'clear': return `${base}.clear()`;
          default: this.Fail(node, `Set method ${method}`);
        }
      }
    }
    this.UnhandledOptional(node, chain);
    if (ts.isIdentifier(callee)) {
      const known = FUNCTIONS[callee.text];
      if (known) {
        if (known.include) this.includes.add(known.include);
        return known.cpp(node.arguments.map(expr));
      }
      if (this.index.Has(callee.text)) {
        const args = this.CoerceArgs(node.arguments.map(expr), node.arguments, this.index.functionParams.get(callee.text));
        return `${this.Name(callee.text)}(${args.join(', ')})`;
      }
      // a function of another TypeScript module that C++ does not have: translated into this file
      const imported = this.ImportedFunction(callee);
      if (imported) {
        if (!this.importedFunctions.has(imported.name.text)) {
          this.importedFunctions.set(imported.name.text, null);
          const previousFile = this.sourceFile;
          this.sourceFile = imported.getSourceFile();
          const saved = { returnType: this.returnType, inConstMethod: this.inConstMethod };
          try {
            this.importedFunctions.set(imported.name.text, this.Function(imported));
          } finally {
            this.sourceFile = previousFile;
            Object.assign(this, saved);
          }
        }
        return `${callee.text}(${node.arguments.map(expr).join(', ')})`;
      }
    }
    if (ts.isPropertyAccessExpression(callee) && callee.expression.kind !== ts.SyntaxKind.ThisKeyword) {
      const args = node.arguments.map(expr);
      const ownerType = this.checker.getNonNullableType(this.checker.getTypeAtLocation(callee.expression));
      const operator = OPERATOR_METHODS[ownerType.symbol?.name]?.[callee.name.text];
      if (operator) return operator(this.Expr(callee.expression, chain), args);
      // obj.GetData(ChangeBetAction): obj.GetData<ChangeBetAction>(); list.TryGet(id, TextElement): list.TryGet<TextElement>(id)
      const tokenIndex = node.arguments.findIndex(arg => this.IsToken(arg) && !ts.isPropertyAccessExpression(arg));
      const templated = this.index.Methods(ownerType.symbol?.name ?? '').get(callee.name.text)?.overloads.some(item => item.isTemplate);
      if (tokenIndex < 0 && templated && this.index.Methods(ownerType.symbol?.name ?? '').get(callee.name.text).overloads.every(item => item.isTemplate)) {
        const resultName = this.checker.getNonNullableType(this.checker.getTypeAtLocation(node)).symbol?.name;
        if (resultName && this.index.Has(resultName)) {
          const pointer = this.IsPointer(callee.expression);
          return `${this.Expr(callee.expression, chain)}${pointer ? '->' : '.'}${callee.name.text}<${this.Name(resultName)}>(${node.arguments.map(expr).join(', ')})`;
        }
      }
      if (tokenIndex >= 0 && (node.arguments.length === 1 || templated)) {
        const pointer = this.IsPointer(callee.expression);
        const rest = node.arguments.filter((_, i) => i !== tokenIndex).map(expr);
        return `${this.Expr(callee.expression, chain)}${pointer ? '->' : '.'}${callee.name.text}<${this.TokenName(node.arguments[tokenIndex])}>(${rest.join(', ')})`;
      }
      const alternative = this.VariantAlternative(callee.expression, this.Expr(callee.expression, chain));
      if (alternative.startsWith('std::get<')) return `${alternative}.${callee.name.text}(${args.join(', ')})`;
      // a method of every alternative of a std::variant
      if (this.IsVariant(ownerType)) {
        this.includes.add('variant');
        return `std::visit([&](auto&& v_) -> decltype(auto) { return v_.${callee.name.text}(${args.join(', ')}); }, ${this.Expr(callee.expression, chain)})`;
      }
      // a method the browser game's class has and its C++ class does not (key()): its one returned expression
      const inlined = this.InlineMethod(node, chain);
      if (inlined) return inlined;
      // a C++ method that takes the runtime first, which the TypeScript does not pass
      const cpp = this.index.Methods(ownerType.symbol?.name ?? '').get(callee.name.text);
      if (cpp && /RuntimeAccess/.test(cppParams(cpp.params)[0]?.type ?? '') && args.length < cppParams(cpp.params).length) args.unshift('GetRuntime()');
      if (!cpp) {
        const coerced = this.CoerceArgs(args, node.arguments, '');
        args.splice(0, coerced.length, ...coerced);
      }
      if (cpp) {
        const offset = args.length - node.arguments.length;
        const coerced = this.CoerceArgs(args.slice(offset), node.arguments, cppParams(cpp.params).slice(offset).map(param => `${param.type} ${param.name ?? 'x'}`).join(', '));
        args.splice(offset, coerced.length, ...coerced);
      }
      // a temporary for a non-const reference: it is named, as a lambda's parameter
      const params = cpp ? cppParams(cpp.params).slice(args.length - node.arguments.length) : [];
      const temporaries = node.arguments.map((argument, i) => /&$/.test(params[i]?.type ?? '') && !/\bconst\b/.test(params[i].type)
        && (ts.isCallExpression(argument) || ts.isNewExpression(argument) || ts.isArrayLiteralExpression(argument)));
      if (temporaries.some(Boolean)) {
        const offset = args.length - node.arguments.length;
        const names = node.arguments.map((_, i) => (temporaries[i] ? `arg${i}_` : args[i + offset]));
        const lambdaParams = node.arguments.map((_, i) => (temporaries[i] ? `auto&& arg${i}_` : null)).filter(Boolean);
        const lambdaArgs = node.arguments.map((_, i) => (temporaries[i] ? args[i + offset] : null)).filter(Boolean);
        return `[&](${lambdaParams.join(', ')}) { return ${expr(callee)}(${[...args.slice(0, offset), ...names].join(', ')}); }(${lambdaArgs.join(', ')})`;
      }
      return `${expr(callee)}(${args.join(', ')})`;
    }
    return `${expr(callee)}(${node.arguments.map(expr).join(', ')})`;
  }

  /** a.b?.[i]?.[j]...: the address of the element when every index is valid (IsValidIndex), else nullptr. Fields on the
   * way are C++ fields (a C++ vector where TypeScript has an optional array); calls are not. */
  CheckedElementPointer(node, chain) {
    const parts = [];
    let item = node;
    while (ts.isElementAccessExpression(item) || ts.isPropertyAccessExpression(item) || ts.isNonNullExpression(item)) {
      if (ts.isElementAccessExpression(item)) {
        const arrayType = this.checker.getNonNullableType(this.checker.getTypeAtLocation(item.expression));
        if (!this.checker.isArrayType(arrayType)) return null;
        parts.unshift(item);
      }
      item = item.expression;
    }
    if (ts.isCallExpression(item)) return null;
    const conditions = parts.map(part => {
      const container = this.Expr(part.expression, { ...(chain ?? {}), optionalRoot: true, ignoreOptional: true });
      return `GameCore::IsValidIndex(${container}, ${this.Expr(part.argumentExpression, chain)})`;
    });
    this.UseHeader('IsValidIndex');
    this.markPointerNodes = this.markPointerNodes ?? new Set();
    this.markPointerNodes.add(node);
    return `(${conditions.join(' && ')} ? &${this.Expr(node, { ...(chain ?? {}), optionalRoot: true, ignoreOptional: true })} : nullptr)`;
  }

  /** Whether an expression's TypeScript type is a Record (an index signature), with or without undefined. */
  DeclaredRecordType(node) {
    const type = this.checker.getNonNullableType(this.checker.getTypeAtLocation(node));
    return !this.checker.isArrayType(type) && !this.checker.isTupleType(type) && !!(type.getStringIndexType() || type.getNumberIndexType() || type.aliasSymbol?.name === 'Record');
  }

  /** Whether an expression is declared as a Record (Partial<Record<K, V>>): a std::map. */
  DeclaredRecord(node) {
    const declaration = ts.isIdentifier(node) ? this.checker.getSymbolAtLocation(node)?.valueDeclaration : null;
    const type = declaration && 'type' in declaration ? declaration.type : null;
    return !!type && ts.isTypeReferenceNode(type) && /^(Record|Partial)$/.test(type.typeName.getText()) && /Record/.test(type.getText());
  }

  /** An object literal: a designated initializer of the C++ struct it initializes, in its fields' order. */
  ObjectLiteral(node, chain) {
    // a Record's literal ({ [K.a]: v }): a std::map's initializer list
    if (node.properties.length && node.properties.every(property => ts.isPropertyAssignment(property) && ts.isComputedPropertyName(property.name))) {
      return `{${node.properties.map(property => `{${this.Expr(property.name.expression, chain)}, ${this.Expr(property.initializer, chain)}}`).join(', ')}}`;
    }
    const contextual = this.checker.getContextualType(node);
    let name = contextual?.aliasSymbol?.name ?? contextual?.symbol?.name;
    // a point, a size, a rect, a color: video_ctrl's
    const own = this.checker.getTypeAtLocation(node);
    const videoName = [name, contextual?.aliasTypeArguments?.[0]?.symbol?.name, ...(contextual?.isUnion() ? contextual.types.map(item => item.aliasSymbol?.name ?? item.symbol?.name) : [])]
      .find(item => item && VIDEO_TYPES[item] && !this.index.Has(item))
      ?? (['Point', 'Size', 'RssRect', 'Color'].find(item => {
        const fields = VIDEO_TYPES[item].fields;
        const props = own.getProperties().map(property => property.name);
        return props.length && props.every(prop => fields.includes(prop)) && (item !== 'Color' ? props.length === fields.length : true);
      }));
    if (videoName) {
      let video = VIDEO_TYPES[videoName];
      // the float kind where C++ takes it (BaseElement::SetPosition(video_ctrl::pointf))
      const paramType = this.CppParamTypeOf(node) ?? '';
      if (/\b(pointf|sizef|rectf)\b/.test(paramType) && !video.cpp.endsWith('f')) video = { ...video, cpp: `${video.cpp}f`, cast: 'float' };
      if (/\bpoint\b/.test(paramType) && video.cpp === 'video_ctrl::pointf') video = { ...video, cpp: 'video_ctrl::point', cast: 'int' };
      const values = new Map(node.properties.map(property => {
        if (ts.isShorthandPropertyAssignment(property)) return [property.name.text, property.name.text];
        if (ts.isPropertyAssignment(property)) return [property.name.getText(), this.Expr(property.initializer, chain)];
        this.Fail(property, 'a spread or method in an object literal');
      }));
      const args = video.fields.filter(field => values.has(field) || field !== 'a').map(field => (values.has(field) ? `${video.cast}(${values.get(field)})` : this.Fail(node, `${videoName} without ${field}`)));
      return `${video.cpp}(${args.join(', ')})`;
    }
    // Partial<X>, Readonly<X>...: X
    if ((!name || !this.index.Has(name)) && contextual?.aliasTypeArguments?.length === 1) name = contextual.aliasTypeArguments[0].symbol?.name;
    // a struct of this file
    const localName = [name, contextual?.symbol?.name].find(item => item && this.localStructs?.has(item))
      ?? [...(this.localStructs?.keys() ?? [])].find(item => {
        const fields = this.localStructs.get(item);
        return node.properties.length === fields.length && node.properties.every(property => fields.includes(property.name?.getText()));
      });
    if (localName) {
      const order = this.localStructs.get(localName);
      const values = node.properties.map(property => {
        if (ts.isShorthandPropertyAssignment(property)) return { name: property.name.text, value: property.name.text };
        if (ts.isPropertyAssignment(property)) return { name: property.name.getText(), value: property.initializer.kind === ts.SyntaxKind.NullKeyword ? '{}' : this.Expr(property.initializer, chain) };
        this.Fail(property, 'a spread or method in an object literal');
      }).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
      return `${localName}{${values.map(value => `.${value.name} = ${value.value}`).join(', ')}}`;
    }
    if (!name || !this.index.Has(name)) this.Fail(node, 'an object literal of no C++ struct');
    this.UseHeader(name);
    const order = this.index.Fields(name);
    const properties = node.properties.map(property => {
      if (ts.isShorthandPropertyAssignment(property)) return { name: property.name.text, value: property.name.text };
      if (ts.isPropertyAssignment(property)) return { name: property.name.getText(), value: this.Expr(property.initializer, chain) };
      this.Fail(property, 'a spread or method in an object literal');
    });
    for (const property of properties) if (!order.includes(property.name)) this.Fail(node, `${name} has no field ${property.name}`);
    properties.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    const qualified = this.index.Qualified(name);
    if (!this.index.IsAggregate(name)) {
      return `[&] { ${qualified} value_; ${properties.map(property => `value_.${property.name} = ${property.value}; `).join('')}return value_; }()`;
    }
    return `${qualified}{${properties.map(property => `.${property.name} = ${property.value}`).join(', ')}}`;
  }
}

export { TranslationError };
