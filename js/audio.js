/** Música de fondo: arranque tras el primer gesto, conmutador persistente. */

import { RUTAS } from "./config.js";
import { leer, escribir } from "./storage.js";

export function crearAudio() {
  const audio = new Audio(RUTAS.musica);
  audio.loop = true;
  audio.volume = 0.35;
  audio.preload = "none";

  let activo = leer("sonido", true) !== false;
  let desbloqueado = false;
  const oyentes = new Set();

  const avisar = () => oyentes.forEach((fn) => fn(activo));

  const intentarSueno = () => {
    if (!activo) return;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => { /* autoplay bloqueado */ });
  };

  return {
    /** Llamar en el primer gesto del usuario. */
    desbloquear() {
      if (desbloqueado) return;
      desbloqueado = true;
      intentarSueno();
    },
    activo: () => activo,
    alternar() {
      activo = !activo;
      escribir("sonido", activo);
      if (activo) {
        desbloqueado = true;
        intentarSueno();
      } else {
        audio.pause();
      }
      avisar();
      return activo;
    },
    pausar() { audio.pause(); },
    reanudar() { if (activo && desbloqueado) intentarSueno(); },
    suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
    /** Pitido corto con WebAudio para el impacto (sin muestras de audio). */
    golpe() {
      if (!activo) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gan = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(140, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.25);
        gan.gain.setValueAtTime(0.18, ctx.currentTime);
        gan.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(gan).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.32);
        osc.onended = () => ctx.close();
      } catch {
        /* sin WebAudio */
      }
    },
  };
}
