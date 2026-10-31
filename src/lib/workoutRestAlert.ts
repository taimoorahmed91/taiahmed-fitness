// Optional sound + vibration when a rest timer finishes. The on-screen "Rest over"
// state never depends on this: browsers can block audio, and phones can be on silent.

export const REST_ALERT_KEY = 'fittrack-rest-alert-enabled';

export const loadRestAlertEnabled = (): boolean => {
  try {
    return localStorage.getItem(REST_ALERT_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const saveRestAlertEnabled = (on: boolean) => {
  try {
    localStorage.setItem(REST_ALERT_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
};

// Short synthesized two-tone chime + vibration.
export const playRestAlert = () => {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.21);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* audio blocked */ }
};
