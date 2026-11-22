/**
 * Dibujo del tablero en canvas.
 *
 * El fondo de cada nivel es un recorte de la plantilla; las fichas son imágenes
 * independientes que se colocan centradas en cada celda. Todo se dibuja con una
 * transformación de vista (escala + desplazamiento) para que quepa en cualquier
 * pantalla y se pueda ampliar.
 *
 * Rendimiento: el tablero se pre-renderiza en un canvas fuera de pantalla a la escala
 * actual (fondo + fichas, ya escaladas). Cada frame es un único blit alineado a píxel;
 * al destapar o marcar una casilla solo se repinta esa casilla en la capa.
 */

import { RUTAS, FICHAS } from "./config.js";
import { ESTADO, MARCAS } from "./board.js";

const NOMBRES_FICHAS = ["limpio", "marca", "seguro", "mina", "numero1", "numero2", "numero3",
  "numero4", "numero5", "numero6"];

/**
 * Las fichas ocupan exactamente la celda: su lienzo (31×28) es la mitad del hexágono
 * de la plantilla (60×52), así que se dibujan a ese tamaño. El halo blanco y la
 * sombra que traen las imágenes son parte del diseño original.
 */
const ESCALA_FICHA = 1.0;

/** Por encima de esta superficie (px de dispositivo) no se cachea la capa del tablero. */
const LIMITE_CAPA = 8_000_000;

function cargarImagen(url) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error(`No se pudo cargar ${url}`));
    img.src = url;
  });
}

export function crearRender(lienzo, caja, opciones = {}) {
  const ctx = lienzo.getContext("2d");
  const fichas = new Map();
  const fondos = new Map();
  const cacheFichas = new Map();
  const vista = { escala: 1, x: 0, y: 0 };
  const estado = { anchoCss: 1, altoCss: 1, dpr: 1 };
  let nivelActual = null;
  let fondoActual = null;
  let ajusteBase = 1;
  let cuadroPedido = 0;
  let contadorDibujos = 0;
  const alCambiarVista = opciones.alCambiarVista ?? null;

  // capa pre-renderizada del tablero
  let capa = null;
  let capaEscala = 0;
  let capaDpr = 0;
  let capaNivel = null;
  let capaPartida = null;
  let firmas = null;

  /** Pide un repintado para el siguiente frame (como mucho uno por frame). */
  function pedirDibujo() {
    if (cuadroPedido) return;
    cuadroPedido = requestAnimationFrame(() => {
      cuadroPedido = 0;
      alCambiarVista?.();
    });
  }

  function redimensionar() {
    const r = caja.getBoundingClientRect();
    const anterior = { ...estado };
    // punto del tablero que está en el centro de la vista (para conservar el zoom)
    let centro = null;
    if (nivelActual && anterior.anchoCss > 1 && anterior.altoCss > 1) {
      centro = {
        x: (anterior.anchoCss / 2 - vista.x) / vista.escala,
        y: (anterior.altoCss / 2 - vista.y) / vista.escala,
        zoom: vista.escala / ajusteBase,
      };
    }

    estado.anchoCss = Math.max(1, Math.round(r.width));
    estado.altoCss = Math.max(1, Math.round(r.height));
    estado.dpr = Math.min(window.devicePixelRatio || 1, 2);
    lienzo.width = Math.round(estado.anchoCss * estado.dpr);
    lienzo.height = Math.round(estado.altoCss * estado.dpr);
    ajustar();

    // si el jugador había ampliado, mantiene su zoom relativo y el encuadre
    if (centro && centro.zoom > 1.001) {
      vista.escala = ajusteBase * centro.zoom;
      vista.x = estado.anchoCss / 2 - centro.x * vista.escala;
      vista.y = estado.altoCss / 2 - centro.y * vista.escala;
      limitarVista();
    }
  }

  /** Encuadra el tablero completo dentro de la caja visible. */
  function ajustar() {
    if (!nivelActual) return;
    const { ancho, alto } = nivelActual.caja;
    ajusteBase = Math.min(estado.anchoCss / ancho, estado.altoCss / alto) * 0.99;
    vista.escala = ajusteBase;
    vista.x = (estado.anchoCss - ancho * ajusteBase) / 2;
    vista.y = (estado.altoCss - alto * ajusteBase) / 2;
    limitarVista();
  }

  function limitarVista() {
    if (!nivelActual) return;
    const { ancho, alto } = nivelActual.caja;
    const w = ancho * vista.escala;
    const h = alto * vista.escala;
    if (w <= estado.anchoCss) vista.x = (estado.anchoCss - w) / 2;
    else vista.x = Math.min(0, Math.max(estado.anchoCss - w, vista.x));
    if (h <= estado.altoCss) vista.y = (estado.altoCss - h) / 2;
    else vista.y = Math.min(0, Math.max(estado.altoCss - h, vista.y));
  }

  async function cargarFichas() {
    if (fichas.size) return;
    await Promise.all(NOMBRES_FICHAS.map(async (nombre) => {
      const img = await cargarImagen(RUTAS.ficha(nombre, true));
      fichas.set(nombre, img);
    }));
  }

  async function cargarNivel(nivel) {
    nivelActual = nivel;
    if (!fondos.has(nivel.id)) {
      fondos.set(nivel.id, await cargarImagen(RUTAS.fondo(nivel.id)));
      // memoria: como mucho dos fondos descodificados a la vez
      while (fondos.size > 2) {
        const primera = fondos.keys().next().value;
        if (primera === nivel.id) break;
        fondos.delete(primera);
      }
    }
    fondoActual = fondos.get(nivel.id);
    capa = null;
    cacheFichas.clear();
    ajustar();
  }

  /* --------------------------------------------------------------- capa/fichas */

  /** Ficha preescalada al tamaño de celda actual (se cachea por tamaño). */
  function fichaEscalada(nombre, ancho, alto) {
    const claveCache = `${nombre}|${ancho}x${alto}`;
    if (cacheFichas.has(claveCache)) return cacheFichas.get(claveCache);
    const original = fichas.get(nombre);
    if (!original) return null;
    const lienzoFicha = document.createElement("canvas");
    lienzoFicha.width = ancho;
    lienzoFicha.height = alto;
    const c = lienzoFicha.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.drawImage(original, 0, 0, ancho, alto);
    cacheFichas.set(claveCache, lienzoFicha);
    return lienzoFicha;
  }

  const firmaCelda = (c) => c.estado * 4 + c.marca;

  function nombreFicha(c) {
    if (c.estado === ESTADO.DESTAPADA) return c.num > 0 ? FICHAS.numero(c.num) : FICHAS.limpio;
    if (c.estado === ESTADO.MINA) return FICHAS.mina;
    if (c.marca === MARCAS.DUDA) return FICHAS.duda;
    if (c.marca === MARCAS.SEGURO) return FICHAS.seguro;
    return null;
  }

  /**
   * Pinta una celda (ficha) en la capa, en píxeles de dispositivo. En la reconstrucción
   * completa el fondo ya está puesto y no hace falta limpiar; en una actualización suelta
   * sí hay que reponer el parche de fondo para borrar la ficha anterior.
   */
  function pintarCelda(ctxCapa, celda, dpr, conFondo) {
    const hexa = nivelActual.hexagono;
    const escala = capaEscala;
    const X = Math.round((celda.x - hexa.ancho / 2) * escala * dpr);
    const Y = Math.round((celda.y - hexa.alto / 2) * escala * dpr);
    const W = Math.round(hexa.ancho * escala * dpr);
    const H = Math.round(hexa.alto * escala * dpr);

    if (conFondo) {
      ctxCapa.clearRect(X, Y, W, H);
      ctxCapa.drawImage(fondoActual,
        celda.x - hexa.ancho / 2, celda.y - hexa.alto / 2, hexa.ancho, hexa.alto,
        X, Y, W, H);
    }

    const nombre = nombreFicha(celda);
    if (!nombre) return;
    const ficha = fichaEscalada(nombre, W, H);
    if (ficha) ctxCapa.drawImage(ficha, X, Y);
  }

  function reconstruirCapa(partida) {
    const dpr = estado.dpr;
    const w = Math.round(nivelActual.caja.ancho * vista.escala * dpr);
    const h = Math.round(nivelActual.caja.alto * vista.escala * dpr);

    if (w * h > LIMITE_CAPA) {
      capa = null;
      capaPartida = partida;
      capaEscala = vista.escala;
      capaDpr = dpr;
      capaNivel = nivelActual;
      return;
    }

    const necesitabaTamano = !capa || capa.width !== w || capa.height !== h;
    if (!capa) capa = document.createElement("canvas");
    if (necesitabaTamano) {
      capa.width = w;
      capa.height = h;
      firmas = null;
    }
    const ctxCapa = capa.getContext("2d");
    ctxCapa.imageSmoothingQuality = "high";
    ctxCapa.clearRect(0, 0, w, h);
    ctxCapa.drawImage(fondoActual, 0, 0, fondoActual.width, fondoActual.height, 0, 0, w, h);

    capaEscala = vista.escala;
    capaDpr = dpr;
    capaNivel = nivelActual;
    capaPartida = partida;
    firmas = new Array(partida.celdas.length);

    for (let i = 0; i < partida.celdas.length; i += 1) {
      const c = partida.celdas[i];
      pintarCelda(ctxCapa, c, dpr, false);
      firmas[i] = firmaCelda(c);
    }
  }

  /** Repinta solo las casillas cuyo estado o marca ha cambiado. */
  function actualizarCeldas(partida) {
    if (!firmas || firmas.length !== partida.celdas.length) {
      reconstruirCapa(partida);
      return;
    }
    const ctxCapa = capa.getContext("2d");
    let cambios = 0;
    for (let i = 0; i < partida.celdas.length; i += 1) {
      const c = partida.celdas[i];
      const firma = firmaCelda(c);
      if (firma === firmas[i]) continue;
      pintarCelda(ctxCapa, c, capaDpr, true);
      firmas[i] = firma;
      cambios += 1;
    }
    return cambios;
  }

  function dibujarDirecto(partida) {
    const { escala, x: ox, y: oy } = vista;
    const hexa = nivelActual.hexagono;
    ctx.drawImage(fondoActual, ox, oy,
      nivelActual.caja.ancho * escala, nivelActual.caja.alto * escala);

    const anchoFicha = hexa.ancho * escala * ESCALA_FICHA;
    const altoFicha = hexa.alto * escala * ESCALA_FICHA;
    const margen = Math.max(anchoFicha, altoFicha);
    for (const c of partida.celdas) {
      const sx = ox + c.x * escala;
      const sy = oy + c.y * escala;
      if (sx < -margen || sy < -margen || sx > estado.anchoCss + margen || sy > estado.altoCss + margen) {
        continue;
      }
      const nombre = nombreFicha(c);
      if (!nombre) continue;
      const img = fichas.get(nombre);
      if (!img) continue;
      ctx.drawImage(img, sx - anchoFicha / 2, sy - altoFicha / 2, anchoFicha, altoFicha);
    }
  }

  function dibujar(partida, opciones = {}) {
    const { debug = false, resaltada = -1 } = opciones;
    contadorDibujos += 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.setTransform(estado.dpr, 0, 0, estado.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (!nivelActual || !fondoActual) return;

    const dpr = estado.dpr;
    const escalaValida = capa && capaEscala === vista.escala && capaDpr === dpr
      && capaNivel === nivelActual && capaPartida === partida;
    if (!escalaValida) {
      reconstruirCapa(partida);
    } else {
      actualizarCeldas(partida);
    }

    const { escala, x: ox, y: oy } = vista;
    if (capa) {
      // blit 1:1 alineado a píxel de dispositivo (sin remuestreo)
      const anchoCss = capa.width / dpr;
      const altoCss = capa.height / dpr;
      const dx = Math.round(ox * dpr) / dpr;
      const dy = Math.round(oy * dpr) / dpr;
      ctx.drawImage(capa, dx, dy, anchoCss, altoCss);
    } else {
      dibujarDirecto(partida);
    }

    if (resaltada >= 0 && partida.celdas[resaltada]) {
      const c = partida.celdas[resaltada];
      const cx = ox + c.x * escala;
      const cy = oy + c.y * escala;
      const w2 = nivelActual.hexagono.ancho * escala;
      const h2 = nivelActual.hexagono.alto * escala;
      ctx.beginPath();
      ctx.moveTo(cx + w2 / 2, cy);
      ctx.lineTo(cx + w2 / 4, cy + h2 / 2);
      ctx.lineTo(cx - w2 / 4, cy + h2 / 2);
      ctx.lineTo(cx - w2 / 2, cy);
      ctx.lineTo(cx - w2 / 4, cy - h2 / 2);
      ctx.lineTo(cx + w2 / 4, cy - h2 / 2);
      ctx.closePath();
      ctx.strokeStyle = "rgba(242,183,5,0.95)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (debug) {
      ctx.strokeStyle = "rgba(255,0,0,0.8)";
      ctx.lineWidth = 1;
      for (const c of partida.celdas) {
        const sx = ox + c.x * escala;
        const sy = oy + c.y * escala;
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy);
        ctx.lineTo(sx + 4, sy);
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx, sy + 4);
        ctx.stroke();
      }
    }
  }

  /**
   * Factor real entre el búfer del canvas y su tamaño en CSS. Normalmente coincide con
   * `devicePixelRatio`, pero si el contenedor cambia de tamaño entre dos mediciones el
   * navegador estira el búfer: usar este factor evita que el toque se desplace.
   */
  function factorBuffer(rect) {
    return {
      x: lienzo.width / Math.max(1, rect.width),
      y: lienzo.height / Math.max(1, rect.height),
    };
  }

  /** Convierte coordenadas de pantalla a coordenadas de la imagen del nivel. */
  function aImagen(clientX, clientY) {
    const r = lienzo.getBoundingClientRect();
    const f = factorBuffer(r);
    const bx = ((clientX - r.left) * f.x) / estado.dpr;
    const by = ((clientY - r.top) * f.y) / estado.dpr;
    return { x: (bx - vista.x) / vista.escala, y: (by - vista.y) / vista.escala };
  }

  function zoomEn(factor, clientX, clientY) {
    const r = lienzo.getBoundingClientRect();
    const px = clientX - r.left;
    const py = clientY - r.top;
    const escalaMax = ajusteBase * 4;
    const nueva = Math.min(escalaMax, Math.max(ajusteBase, vista.escala * factor));
    if (nueva === vista.escala) return;
    // mantener fijo el punto bajo el cursor
    const ix = (px - vista.x) / vista.escala;
    const iy = (py - vista.y) / vista.escala;
    vista.escala = nueva;
    vista.x = px - ix * nueva;
    vista.y = py - iy * nueva;
    limitarVista();
    pedirDibujo();
  }

  function desplazar(dx, dy) {
    if (!dx && !dy) return;
    const antesX = vista.x;
    const antesY = vista.y;
    vista.x += dx;
    vista.y += dy;
    limitarVista();
    if (vista.x !== antesX || vista.y !== antesY) pedirDibujo();
  }

  function vistaActual() {
    return { ...vista, ajusteBase, anchoCss: estado.anchoCss, altoCss: estado.altoCss };
  }

  /** Coordenadas de pantalla (cliente) del centro de una celda. */
  function posicionCelda(celda) {
    const r = lienzo.getBoundingClientRect();
    const f = factorBuffer(r);
    const bx = estado.dpr * (vista.x + celda.x * vista.escala);
    const by = estado.dpr * (vista.y + celda.y * vista.escala);
    return { x: r.left + bx / f.x, y: r.top + by / f.y };
  }

  function reiniciarVista() { ajustar(); }

  return {
    cargarFichas, cargarNivel, dibujar, aImagen, zoomEn, desplazar,
    vistaActual, redimensionar, ajustar, reiniciarVista, posicionCelda,
    pedirDibujo, dibujos: () => contadorDibujos,
  };
}
