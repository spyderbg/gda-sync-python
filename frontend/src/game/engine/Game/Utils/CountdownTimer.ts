// Egt::Game::CountdownTimer (Egt/Game/Utils/CountdownTimer.h): expires a duration after it starts; durations in ms.

export class CountdownTimer {
  private m_duration = 0;
  private m_startTime = performance.now();
  private m_running = false;

  IsRunning() {
    return this.m_running;
  }

  IsExpired() {
    return this.m_running && this.GetRemainingTime() <= 0;
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
    return this.m_running ? Math.max(this.m_duration - (performance.now() - this.m_startTime), 0) : this.m_duration;
  }
}
