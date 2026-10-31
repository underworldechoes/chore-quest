// Tiny WebAudio blips: no asset files needed.
let ctx;

export function blip(freq = 440, duration = 0.08, type = 'square', volume = 0.04) {
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* audio unavailable: silently skip */ }
}

export const sfx = {
  zap: () => blip(660, 0.07),
  agree: () => blip(880, 0.09, 'triangle'),
  skip: () => blip(140, 0.18, 'sawtooth'),
  sweep: () => { blip(523, 0.1); setTimeout(() => blip(784, 0.15), 90); },
};
