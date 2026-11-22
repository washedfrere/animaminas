/**
 * Entrada del usuario sobre el tablero.
 *
 *  - Un toque (o clic) espera 280 ms y luego marca; dos toques seguidos destapan.
 *  - Mantener pulsado 450 ms marca al instante, sin esperar.
 *  - Arrastrar con el tablero ampliado lo desplaza; pellizcar (o rueda) hace zoom.
 *  - Con teclado: flechas mueven la selección, Enter destapa, Espacio marca.
 */

import { CONFIG } from "./config.js";
import { celdaEnPunto } from "./grid.js";

export function conectarEntrada({ lienzo, render, obtenerPartida, alDestapar, alMarcar, alCambiarSeleccion }) {
  let punteros = new Map();
  let pendiente = null;        // {indice, temporizador}
  let pulsacion = null;        // {temporizador, indice, x, y, disparada}
  let arrastre = null;         // {x, y, inicioX, inicioY, movido}
  let pellizco = null;         // {distancia}
  let gestoVista = false;      // el gesto actual movió la vista: no debe marcar
  let seleccion = -1;

  const indiceEn = (clientX, clientY) => {
    const p = render.aImagen(clientX, clientY);
    return celdaEnPunto(obtenerPartida().celdas, p.x, p.y, 34);
  };

  function cancelarPendiente() {
    if (pendiente) {
      clearTimeout(pendiente.temporizador);
      pendiente = null;
    }
  }

  function cancelarPulsacion() {
    if (pulsacion) {
      clearTimeout(pulsacion.temporizador);
      pulsacion = null;
    }
  }

  /** Cualquier inicio de gesto de vista anula el toque pendiente. */
  function empezarGestoVista() {
    gestoVista = true;
    cancelarPendiente();
    cancelarPulsacion();
  }

  function alPulsar(ev) {
    ev.preventDefault();
    lienzo.focus?.();
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (punteros.size === 2) {
      empezarGestoVista();
      arrastre = null;
      const [a, b] = [...punteros.values()];
      pellizco = { distancia: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    if (punteros.size > 2) return;

    gestoVista = false;
    arrastre = {
      x: ev.clientX, y: ev.clientY,
      inicioX: ev.clientX, inicioY: ev.clientY,
      movido: false,
    };
    const indice = indiceEn(ev.clientX, ev.clientY);
    pulsacion = {
      indice,
      disparada: false,
      temporizador: setTimeout(() => {
        if (!pulsacion || pulsacion.disparada) return;
        pulsacion.disparada = true;
        if (indice >= 0) alMarcar(indice);
      }, CONFIG.pulsacionLarga),
    };
  }

  function alMover(ev) {
    if (!punteros.has(ev.pointerId)) return;
    punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pellizco && punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      const distancia = Math.hypot(a.x - b.x, a.y - b.y);
      if (pellizco.distancia > 0) {
        render.zoomEn(distancia / pellizco.distancia, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      pellizco.distancia = distancia;
      return;
    }

    if (!arrastre) return;
    const dx = ev.clientX - arrastre.x;
    const dy = ev.clientY - arrastre.y;
    const recorrido = Math.hypot(ev.clientX - arrastre.inicioX, ev.clientY - arrastre.inicioY);

    if (!arrastre.movido) {
      // un movimiento pequeño ya cancela la pulsación larga (dedo tembloroso)
      if (recorrido > CONFIG.umbralPulsacion) cancelarPulsacion();
      if (recorrido > CONFIG.umbralArrastre) {
        arrastre.movido = true;
        empezarGestoVista();
      }
    }
    if (arrastre.movido) {
      render.desplazar(dx, dy);
      arrastre.x = ev.clientX;
      arrastre.y = ev.clientY;
    }
  }

  function alSoltar(ev) {
    const estaba = punteros.delete(ev.pointerId);
    if (!estaba) return;

    const habiaPellizco = pellizco !== null;
    if (punteros.size < 2) pellizco = null;

    const fuePulsacionLarga = pulsacion?.disparada;
    cancelarPulsacion();
    const eraArrastre = arrastre?.movido;

    // si queda un dedo tras el pellizco, se puede seguir arrastrando con él
    if (habiaPellizco && punteros.size === 1) {
      const [restante] = [...punteros.values()];
      arrastre = {
        x: restante.x, y: restante.y,
        inicioX: restante.x, inicioY: restante.y,
        movido: true,
      };
      return;
    }
    arrastre = null;

    if (fuePulsacionLarga || eraArrastre || gestoVista) {
      if (punteros.size === 0) gestoVista = false;
      return;
    }

    const indice = indiceEn(ev.clientX, ev.clientY);
    if (indice < 0) { cancelarPendiente(); return; }

    if (pendiente && pendiente.indice === indice) {
      clearTimeout(pendiente.temporizador);
      pendiente = null;
      alDestapar(indice);
      return;
    }
    cancelarPendiente();
    pendiente = {
      indice,
      temporizador: setTimeout(() => {
        pendiente = null;
        alMarcar(indice);
      }, CONFIG.retardoToque),
    };
  }

  function alRueda(ev) {
    if (!ev.ctrlKey && Math.abs(ev.deltaY) < 2) return;
    ev.preventDefault();
    render.zoomEn(ev.deltaY < 0 ? 1.08 : 1 / 1.08, ev.clientX, ev.clientY);
  }

  function alTeclado(ev) {
    const partida = obtenerPartida();
    if (!partida) return;
    const celdas = partida.celdas;
    if (!celdas.length) return;
    const actual = celdas[seleccion] ?? celdas[0];
    const cercana = (dcol, dfila) => {
      // busca la celda existente más próxima a la columna/fila pedida
      let mejor = -1;
      let mejorD = Infinity;
      for (const c of celdas) {
        const dc = Math.abs(c.col - (actual.col + dcol));
        const df = Math.abs(c.fila - (actual.fila + dfila));
        const d = dc * 2 + df;
        if (d < mejorD) { mejorD = d; mejor = c.i; }
      }
      return mejor;
    };
    switch (ev.key) {
      case "ArrowLeft": seleccion = cercana(-1, 0); break;
      case "ArrowRight": seleccion = cercana(1, 0); break;
      case "ArrowUp": seleccion = cercana(0, -1); break;
      case "ArrowDown": seleccion = cercana(0, 1); break;
      case "Enter": ev.preventDefault(); alDestapar(seleccion); return;
      case " ": ev.preventDefault(); alMarcar(seleccion); return;
      default: return;
    }
    ev.preventDefault();
    render.asegurarVisible(celdas[seleccion]);
    alCambiarSeleccion?.(seleccion);
  }

  lienzo.addEventListener("pointerdown", alPulsar);
  lienzo.addEventListener("pointermove", alMover);
  lienzo.addEventListener("pointerup", alSoltar);
  lienzo.addEventListener("pointercancel", alSoltar);
  lienzo.addEventListener("wheel", alRueda, { passive: false });
  lienzo.addEventListener("keydown", alTeclado);
  lienzo.addEventListener("contextmenu", (e) => e.preventDefault());
  lienzo.tabIndex = 0;

  return {
    seleccion: () => seleccion,
    fijarSeleccion(indice) { seleccion = indice; },
    reiniciar() {
      cancelarPendiente();
      if (pulsacion) clearTimeout(pulsacion.temporizador);
      pulsacion = null;
      arranque();
    },
    destruir() {
      cancelarPendiente();
      if (pulsacion) clearTimeout(pulsacion.temporizador);
      lienzo.removeEventListener("pointerdown", alPulsar);
      lienzo.removeEventListener("pointermove", alMover);
      lienzo.removeEventListener("pointerup", alSoltar);
      lienzo.removeEventListener("pointercancel", alSoltar);
      lienzo.removeEventListener("wheel", alRueda);
      lienzo.removeEventListener("keydown", alTeclado);
    },
  };

  function arranque() { /* reservado: limpieza de estado entre partidas */ }
}
