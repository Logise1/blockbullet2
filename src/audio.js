// Retro Sound FX Synthesizer using Web Audio API

let audioCtx = null;
let soundEnabled = true;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export const audioSystem = {
  toggleSound() {
    soundEnabled = !soundEnabled;
    return soundEnabled;
  },

  isSoundEnabled() {
    return soundEnabled;
  },

  playTap() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  },

  playPlace() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  },

  playClear() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // Play a quick ascending major arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const time = now + idx * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.08, time);
        gain.gain.linearRampToValueAtTime(0.001, time + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(time);
        osc.stop(time + 0.12);
      });
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  },

  playCombo(multiplier) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      
      // Scale pitch with multiplier
      const baseFreq = 600 + (multiplier * 100);
      
      // Spark/Chime sound (two oscillators slightly detuned)
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq + (i * 12), now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.25);
        
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  },

  playGameOver(isWinner) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      if (isWinner) {
        // Upward energetic victory tune
        const victoryNotes = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50];
        victoryNotes.forEach((freq, idx) => {
          const time = now + idx * 0.08;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, time);
          gain.gain.setValueAtTime(0.1, time);
          gain.gain.linearRampToValueAtTime(0.001, time + 0.2);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(time);
          osc.stop(time + 0.2);
        });
      } else {
        // Melancholic downward defeat tune
        const defeatNotes = [392.00, 369.99, 349.23, 311.13, 293.66]; // G4, F#4, F4, D#4, D4
        defeatNotes.forEach((freq, idx) => {
          const time = now + idx * 0.15;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, time);
          osc.frequency.linearRampToValueAtTime(freq - 20, time + 0.2);
          
          gain.gain.setValueAtTime(0.08, time);
          gain.gain.linearRampToValueAtTime(0.001, time + 0.2);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(time);
          osc.stop(time + 0.25);
        });
      }
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  },

  playError() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }
};
