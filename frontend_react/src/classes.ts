/** Join class names, including a Vue-style `{ active: condition }` map. */
export function classes(...items: Array<string | false | null | undefined | Record<string, boolean | null | undefined>>): string {
  const names: string[] = [];
  for (const item of items) {
    if (!item) continue;
    if (typeof item === 'string') names.push(item);
    else for (const [name, on] of Object.entries(item)) if (on) names.push(name);
  }
  return names.join(' ');
}
