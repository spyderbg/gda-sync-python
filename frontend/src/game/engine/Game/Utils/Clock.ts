// Egt::Game::Clock (Egt/Game/Utils/Clock.h/.cpp): the game's time, in milliseconds: the page's time at a speed, which a
// pause stops. A change of speed or pause never moves the clock: the time passed at the old rate is folded in first.
// The speed is set by several tools (the Automation window, the QA bridge, the message board), and none of them may
// resume a paused game: the speed set while paused applies on resume.

let g_pivot = performance.now();
let g_offset = 0;
let g_speed = 1.0;
let g_paused = false;

function Rate() {
  return g_paused ? 0.0 : g_speed;
}

// Folds the time passed since the pivot into the offset at the current rate, so a change of rate never moves the clock.
function Advance() {
  const currentTime = performance.now();
  const delta = currentTime - g_pivot;
  g_pivot = currentTime;
  g_offset += delta * Rate();
}

export const Clock = {
  /** The game's time now, in milliseconds. */
  now() {
    return g_offset + (performance.now() - g_pivot) * Rate();
  },

  GetSpeed() {
    return g_speed;
  },

  SetSpeed(speed: number) {
    console.assert(speed >= 0);
    speed = Math.max(0.0, speed);
    Advance();
    g_speed = speed;
  },

  IsPaused() {
    return g_paused;
  },

  SetPaused(paused: boolean) {
    Advance();
    g_paused = paused;
  },
};
