let audioCtx: AudioContext | null = null;

/**
 * Короткий приятный "дзынь" из двух нот через Web Audio API — без внешних
 * аудиофайлов. Если браузер блокирует автовоспроизведение звука (типичная
 * политика браузеров до первого взаимодействия пользователя со страницей) —
 * просто тихо ничего не делаем, это не критично.
 */
export function playNotificationChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const now = audioCtx.currentTime;
    const notes = [880, 1174.66]; // A5 → D6

    notes.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);

      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  } catch {
    // звук не критичен — молча игнорируем любые ошибки Web Audio API
  }
}
