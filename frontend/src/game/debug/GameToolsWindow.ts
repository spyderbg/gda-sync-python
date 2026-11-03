// The Game tools page's browser window (/game-tools, GameToolsPage.vue): where the Play page opens it (Tools › Open in a
// new window) and the place it had when it last closed, which the next one opens at.

export const GAME_TOOLS_PATH = '/game-tools';
const WINDOW_NAME = 'egt-game-tools';
const PLACE_KEY = 'egt-game-tools-window';

/** The window's place and size when it last closed, for the next one. */
function Features() {
  const place = { left: 0, top: 0, width: 960, height: 900 };
  try {
    Object.assign(place, JSON.parse(window.localStorage.getItem(PLACE_KEY) ?? '{}'));
  } catch {
    // the default size, where the browser puts it
  }
  const at = place.left || place.top ? `,left=${place.left},top=${place.top}` : '';
  return `popup,width=${place.width},height=${place.height}${at}`;
}

/** Opens the Game tools page in its window, or brings it to the front; false when the browser blocked it. */
export function OpenGameToolsWindow() {
  const target = window.open('', WINDOW_NAME, Features());
  if (!target) return false;
  try {
    // a new window is blank; one that shows the tools already keeps them
    if (target.location.pathname !== GAME_TOOLS_PATH) target.location.href = GAME_TOOLS_PATH;
  } catch {
    target.location.href = GAME_TOOLS_PATH;
  }
  target.focus();
  return true;
}

/** Keeps the window's place for the next one (called by the page, when it is hidden). */
export function SaveGameToolsPlace() {
  try {
    const place = { left: window.screenX, top: window.screenY, width: window.innerWidth, height: window.innerHeight };
    if (place.width > 0 && place.height > 0) window.localStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // the next window opens at the default place
  }
}
