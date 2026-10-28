// Egt::Game::CountdownTimer (Egt/Game/Utils/CountdownTimer.h/.cpp): expires a duration after it starts; durations in ms.
// A timer that is not running has no time left, so it reads as expired, as in C++.

export class CountdownTimer {
  private m_duration = 0;
  private m_startTime = performance.now();
  private m_running = false;

  IsRunning() {
    return this.m_running;
  }

  IsExpired() {
    return this.GetRemainingTime() <= 0;
  }

  Start() {
    this.m_startTime = performance.now();
    this.m_running = true;
  }

  Stop() {
    this.m_running = false;
  }

  SetDuration(countdownDuration: number) {
    this.m_duration = countdownDuration;
  }

  GetRemainingTime() {
    if (!this.m_running) return 0;
    return this.m_duration - (performance.now() - this.m_startTime);
  }
}
