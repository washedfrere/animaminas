/**
 * Motor del juego (lógica pura, sin DOM).
 *
 * Reglas implementadas (ver OBJETIVO.md §4):
 *  - 3 vidas; pisar una mina resta una y deja la casilla con la mina a la vista.
 *  - Las seis vecinas de una mina pisada quedan destapadas con su número; las que
 *    tienen 0 minas alrededor arrastran su cascada; las que son mina siguen ocultas.
 *  - Destapar una casilla con 0 minas alrededor limpia en cascada las vecinas.
 *  - Marcar cicla: sin marca → seguro (!) → duda (?) → sin marca. Una casilla marcada
 *    no se puede destapar; una destapada o con mina a la vista no se puede marcar.
 *  - El doble toque sobre un seguro lo quita (vuelve a "sin marca"); sobre una duda no
 *    hace nada, porque ya se quita con un toque.
 *  - Se gana cuando TODAS las bombas están identificadas (con seguro o explotadas),
 *    ninguna casilla sin bomba lleva seguro y no queda ninguna duda pendiente.
 */

import { clave, vecinasDe } from "./grid.js";

export const ESTADO = Object.freeze({
  OCULTA: 0,
  DESTAPADA: 2,
  MINA: 3,
});

export const MARCAS = Object.freeze({
  NINGUNA: 0,
  DUDA: 1,
  SEGURO: 2,
});

/**
 * Orden del ciclo de marcas: la duda queda como último recurso. El seguro se pone
 * con un solo toque (es lo que hay que señalar para ganar) y la duda después.
 */
const SIGUIENTE_MARCA = Object.freeze({
  [MARCAS.NINGUNA]: MARCAS.SEGURO,
  [MARCAS.SEGURO]: MARCAS.DUDA,
  [MARCAS.DUDA]: MARCAS.NINGUNA,
});

export const FIN = Object.freeze({
  JUGANDO: "jugando",
  VICTORIA: "victoria",
  DERROTA: "derrota",
});

/**
 * Crea una partida nueva.
 * @param {object} nivel  entrada de levels.json
 * @param {object} [opciones]
 * @param {number} [opciones.intentos=1]
 * @param {() => number} [opciones.aleatorio=Math.random]
 * @param {number[]|null} [opciones.minas]  índices de mina para repetir un tablero
 * @param {boolean} [opciones.sinAyuda=false]  no destapar la casilla de ayuda inicial
 */
export function crearPartida(nivel, opciones = {}) {
  const { intentos = 1, aleatorio = Math.random, minas = null, sinAyuda = false } = opciones;

  const celdas = nivel.celdas.map((c, i) => ({
    i,
    col: c.col,
    fila: c.fila,
    x: c.x,
    y: c.y,
    mina: false,
    num: 0,
    estado: ESTADO.OCULTA,
    marca: MARCAS.NINGUNA,
  }));

  const mapa = new Map(celdas.map((c) => [clave(c.col, c.fila), c.i]));
  const partida = {
    nivel,
    celdas,
    mapa,
    vidas: 3,
    intentos,
    dudas: 0,
    dudaPendiente: null,
    estado: FIN.JUGANDO,
    inicioMs: null,
    finMs: null,
    minasTotales: nivel.minas,
    indicesMinas: [],
    avisos: { bombasDeMas: false, todoDestapado: false },
  };

  const indices = minas ?? elegirMinas(celdas.length, nivel.minas, aleatorio);
  for (const i of indices) {
    celdas[i].mina = true;
    partida.indicesMinas.push(i);
  }
  calcularNumeros(partida);

  // Ayuda inicial: destapar una casilla segura de las que más minas tienen al lado.
  if (!sinAyuda) ayudaInicial(partida, aleatorio);
  comprobarFin(partida);
  return partida;
}

/** Elige `cuantas` índices distintos al azar. */
export function elegirMinas(total, cuantas, aleatorio = Math.random) {
  const indices = Array.from({ length: total }, (_, i) => i);
  const n = Math.min(cuantas, total - 1);
  for (let i = 0; i < n; i += 1) {
    const j = i + Math.floor(aleatorio() * (total - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, n);
}

export function calcularNumeros(partida) {
  for (const c of partida.celdas) {
    if (c.mina) {
      c.num = 0;
      continue;
    }
    let n = 0;
    for (const k of vecinasDe(partida.mapa, c.col, c.fila)) {
      if (partida.celdas[partida.mapa.get(k)].mina) n += 1;
    }
    c.num = n;
  }
}

function ayudaInicial(partida, aleatorio) {
  let maximo = -1;
  const candidatas = [];
  for (const c of partida.celdas) {
    if (c.mina) continue;
    if (c.num > maximo) {
      maximo = c.num;
      candidatas.length = 0;
      candidatas.push(c.i);
    } else if (c.num === maximo) {
      candidatas.push(c.i);
    }
  }
  if (!candidatas.length) return;
  const elegida = candidatas[Math.floor(aleatorio() * candidatas.length)];
  destaparSeguro(partida, elegida);
}

export function contarSeguros(partida) {
  return partida.celdas.reduce((n, c) => n + (c.marca === MARCAS.SEGURO ? 1 : 0), 0);
}

export function contarDudas(partida) {
  return partida.celdas.reduce((n, c) => n + (c.marca === MARCAS.DUDA ? 1 : 0), 0);
}

export function contarExplotadas(partida) {
  return partida.celdas.reduce((n, c) => n + (c.estado === ESTADO.MINA ? 1 : 0), 0);
}

/** ¿Se puede marcar esta casilla? Solo si sigue oculta. */
export function sePuedeMarcar(celda) {
  return celda.estado === ESTADO.OCULTA;
}

/**
 * Cuenta la duda abandonada: si había una duda pendiente en otra casilla, suma una
 * duda al contador (penalización de puntuación).
 */
function resolverDudaPendiente(partida, indiceTocado) {
  const pendiente = partida.dudaPendiente;
  if (pendiente === null || pendiente === indiceTocado) return;
  const celda = partida.celdas[pendiente];
  if (celda && celda.marca === MARCAS.DUDA) partida.dudas += 1;
  partida.dudaPendiente = null;
}

/**
 * Un toque: cicla la marca de la casilla.
 * @returns {{cambio: boolean, avisos: string[]}}
 */
export function marcar(partida, i, ahoraMs = null) {
  if (partida.estado !== FIN.JUGANDO) return { cambio: false, avisos: [] };
  const c = partida.celdas[i];
  if (!c || !sePuedeMarcar(c)) return { cambio: false, avisos: [] };

  iniciarReloj(partida, ahoraMs);
  resolverDudaPendiente(partida, i);

  const anterior = c.marca;
  c.marca = SIGUIENTE_MARCA[anterior];
  if (anterior === MARCAS.DUDA && partida.dudaPendiente === i) partida.dudaPendiente = null;
  if (c.marca === MARCAS.DUDA) partida.dudaPendiente = i;

  const avisos = actualizarAvisos(partida);
  comprobarFin(partida);
  return { cambio: true, avisos };
}

/**
 * Doble toque: quita el seguro si lo hay; si no, destapa la casilla.
 * Una casilla con duda no se destapa ni se desmarca con doble toque (basta un toque).
 * @returns {{tipo: "nada"|"destape"|"mina"|"desmarcar", perdidaVida: boolean, avisos: string[]}}
 */
export function destapar(partida, i, ahoraMs = null) {
  const c = partida.celdas[i];
  const nada = { tipo: "nada", perdidaVida: false, avisos: [] };
  if (!c || partida.estado !== FIN.JUGANDO) return nada;
  if (c.estado !== ESTADO.OCULTA) return nada;

  if (c.marca === MARCAS.SEGURO) {
    iniciarReloj(partida, ahoraMs);
    resolverDudaPendiente(partida, i);
    c.marca = MARCAS.NINGUNA;
    const avisos = actualizarAvisos(partida);
    comprobarFin(partida);
    return { tipo: "desmarcar", perdidaVida: false, avisos };
  }
  if (c.marca !== MARCAS.NINGUNA) return nada;

  iniciarReloj(partida, ahoraMs);
  resolverDudaPendiente(partida, i);

  if (c.mina) {
    pisarMina(partida, c);
    const avisos = actualizarAvisos(partida);
    comprobarFin(partida);
    return { tipo: "mina", perdidaVida: true, avisos };
  }

  destaparSeguro(partida, i);
  const avisos = actualizarAvisos(partida);
  comprobarFin(partida);
  return { tipo: "destape", perdidaVida: false, avisos };
}

function iniciarReloj(partida, ahoraMs) {
  if (partida.inicioMs === null) partida.inicioMs = ahoraMs ?? Date.now();
}

/** Destapa una casilla segura y, si tiene 0 minas alrededor, propaga la cascada. */
function destaparSeguro(partida, i) {
  const cola = [i];
  const vistos = new Set([i]);
  while (cola.length) {
    const actual = partida.celdas[cola.pop()];
    if (actual.estado === ESTADO.DESTAPADA || actual.estado === ESTADO.MINA) continue;
    desmarcar(partida, actual);
    actual.estado = ESTADO.DESTAPADA;
    if (actual.num !== 0) continue;
    for (const k of vecinasDe(partida.mapa, actual.col, actual.fila)) {
      const idx = partida.mapa.get(k);
      const vecina = partida.celdas[idx];
      if (vecina.mina || vistos.has(idx) || vecina.estado === ESTADO.DESTAPADA) continue;
      vistos.add(idx);
      cola.push(idx);
    }
  }
}

/** Quita la marca de una casilla que se destapa y ajusta la duda pendiente. */
function desmarcar(partida, celda) {
  if (celda.marca === MARCAS.NINGUNA) return;
  if (partida.dudaPendiente === celda.i) partida.dudaPendiente = null;
  celda.marca = MARCAS.NINGUNA;
}

function pisarMina(partida, celda) {
  celda.estado = ESTADO.MINA;
  celda.marca = MARCAS.NINGUNA;
  partida.vidas -= 1;

  // Las seis vecinas quedan destapadas con su número; las de 0 arrastran su cascada.
  for (const k of vecinasDe(partida.mapa, celda.col, celda.fila)) {
    const vecina = partida.celdas[partida.mapa.get(k)];
    if (vecina.mina) continue;
    if (vecina.estado === ESTADO.DESTAPADA || vecina.estado === ESTADO.MINA) continue;
    if (vecina.num === 0) {
      destaparSeguro(partida, vecina.i);
    } else {
      desmarcar(partida, vecina);
      vecina.estado = ESTADO.DESTAPADA;
    }
  }
}

/** Avisos puntuales que se muestran una sola vez por tablero. */
function actualizarAvisos(partida) {
  const nuevos = [];
  const seguros = contarSeguros(partida);
  const explotadas = contarExplotadas(partida);
  if (!partida.avisos.bombasDeMas && seguros + explotadas > partida.minasTotales) {
    partida.avisos.bombasDeMas = true;
    nuevos.push("bombasDeMas");
  }
  if (!partida.avisos.todoDestapado) {
    const quedaSegura = partida.celdas.some((c) => !c.mina && c.estado !== ESTADO.DESTAPADA);
    if (!quedaSegura && partida.estado === FIN.JUGANDO) {
      partida.avisos.todoDestapado = true;
      nuevos.push("todoDestapado");
    }
  }
  return nuevos;
}

export function comprobarFin(partida) {
  if (partida.estado !== FIN.JUGANDO) return partida.estado;

  if (partida.vidas <= 0) {
    partida.vidas = 0;
    partida.estado = FIN.DERROTA;
    partida.finMs = partida.finMs ?? Date.now();
    for (const c of partida.celdas) {
      if (c.mina && c.estado !== ESTADO.MINA) c.estado = ESTADO.MINA;
    }
    return partida.estado;
  }

  const bombasIdentificadas = partida.celdas.every(
    (c) => !c.mina || c.marca === MARCAS.SEGURO || c.estado === ESTADO.MINA,
  );
  const seguroFalso = partida.celdas.some(
    (c) => !c.mina && c.marca === MARCAS.SEGURO,
  );
  const quedanDudas = partida.celdas.some((c) => c.marca === MARCAS.DUDA);

  if (bombasIdentificadas && !seguroFalso && !quedanDudas) {
    partida.estado = FIN.VICTORIA;
    partida.finMs = partida.finMs ?? Date.now();
  }
  return partida.estado;
}

/** Segundos jugados (0 si el reloj no ha arrancado). */
export function segundos(partida, ahoraMs = Date.now()) {
  if (partida.inicioMs === null) return 0;
  const fin = partida.finMs ?? ahoraMs;
  return Math.max(0, Math.floor((fin - partida.inicioMs) / 1000));
}

/** Puntos al ganar (ver OBJETIVO.md §7): el seguro no penaliza, la duda abandonada sí. */
export function calcularPuntos(partida, segundosJugados) {
  const base = { 1: 300, 2: 600, 3: 1000, 4: 1500 }[partida.nivel.id] ?? 300;
  const tiempo = partida.nivel.cronometro ? Math.floor(segundosJugados) : 0;
  const puntos = base
    - tiempo
    - 100 * Math.max(0, partida.intentos - 1)
    - 25 * partida.dudas;
  return Math.max(0, Math.round(puntos));
}

/** Casillas destapadas que no son mina (para la barra de progreso). */
export function progreso(partida) {
  const total = partida.celdas.filter((c) => !c.mina).length;
  const hechas = partida.celdas.filter((c) => !c.mina && c.estado === ESTADO.DESTAPADA).length;
  return { total, hechas, fraccion: total ? hechas / total : 0 };
}

/** Minas que quedan por señalar con seguro. */
export function minasRestantes(partida) {
  return Math.max(0, partida.minasTotales - contarSeguros(partida));
}
