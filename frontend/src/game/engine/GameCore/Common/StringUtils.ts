// Egt::GameCore string helpers (GameCore/Common/StringUtils.h/.cpp), with the C++'s names and results.

/** Split(s, delim): the parts of s between its delimiters, as std::views::split makes them: an empty s has none (where
 * JavaScript's split gives one empty part); otherwise each delimiter ends a part, so "a|" is "a" and "".
 *
 *   Split("adsf qwer poui fdgh", ' ') -> ["adsf", "qwer", "poui", "fdgh"]
 */
export function Split(s: string, delim: string): string[] {
  if (s === '') {
    return [];
  }
  return s.split(delim);
}
