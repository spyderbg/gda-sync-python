// Egt/GameCore/Log/LogCategory.h: a class's log category and its messages, by the C++ macros' names, which the
// translator writes back as they are. A class with a category declares it after the class:
//
//   EgtALogCategoryClass(IdleState, 'IdleState');    EgtALogCategoryClassDeclaration(); in the .h, the macro in the .cpp
//
// and logs with EgtATrace/EgtADebug/EgtAInfo/EgtAWarning/EgtAError(format, ...args), format in fmt's {} placeholders.
// The browser prints them to the console when the developer panel's logging is on (EnableGameLogs).

const categories = new Map<unknown, string>();
let enabled = false;

/** Whether the game's log messages print to the console. */
export function EnableGameLogs(on: boolean) {
  enabled = on;
}

export function EgtALogCategoryClass(type: abstract new (...args: never[]) => unknown, name: string) {
  categories.set(type, name);
}

function Format(format: string, args: unknown[]) {
  let index = 0;
  return format.replace(/\{[^{}]*\}/g, () => String(args[index++]));
}

export function EgtATrace(format: string, ...args: unknown[]) {
  if (enabled) console.debug(Format(format, args));
}

export function EgtADebug(format: string, ...args: unknown[]) {
  if (enabled) console.debug(Format(format, args));
}

export function EgtAInfo(format: string, ...args: unknown[]) {
  if (enabled) console.info(Format(format, args));
}

export function EgtAWarning(format: string, ...args: unknown[]) {
  console.warn(Format(format, args));
}

export function EgtAError(format: string, ...args: unknown[]) {
  console.error(Format(format, args));
}
