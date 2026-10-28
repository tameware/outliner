/**
 * Short UI beep when a command is rejected (no-op).
 * Best-effort; silent if AudioContext is unavailable.
 */
export function systemBeep() {
  try {
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 660;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    osc.start(t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    osc.stop(t0 + 0.1);
    osc.onended = () => {
      void ctx.close?.();
    };
  } catch {
    // ignore
  }
}
