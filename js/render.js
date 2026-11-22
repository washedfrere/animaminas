/**
 * Dibujo del tablero en canvas.
 *
 * El fondo de cada nivel es un recorte de la plantilla; las fichas son imágenes
 * independientes que se colocan centradas en cada celda. Todo se dibuja con una
 * transformación de vista (escala + desplazamiento) para que quepa en cualquier
 * pantalla y se pueda ampliar.
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
  const vista = { escala: 1, x: 0, y: 0 };
  const estado = { anchoCss: 1, altoCss: 1, dpr: 1 };
  let nivelActual = null;
  let fondoActual = null;
  let ajusteBase = 1;
  let cuadroPedido = 0;
  let contadorDibujos = 0;
  const alCambiarVista = opciones.alCambiarVista ?? null;

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
    estado.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
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
    }
    fondoActual = fondos.get(nivel.id);
    ajustar();
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
    const { escala, x: ox, y: oy } = vista;
    ctx.drawImage(fondoActual, ox, oy,
      nivelActual.caja.ancho * escala, nivelActual.caja.alto * escala);

    const hexa = nivelActual.hexagono;
    const anchoFicha = hexa.ancho * escala * ESCALA_FICHA;
    const altoFicha = hexa.alto * escala * ESCALA_FICHA;
    const margen = Math.max(anchoFicha, altoFicha);

    for (const c of partida.celdas) {
      const sx = ox + c.x * escala;
      const sy = oy + c.y * escala;
      if (sx < -margen || sy < -margen || sx > estado.anchoCss + margen || sy > estado.altoCss + margen) {
        continue;
      }
      let nombre = null;
      if (c.estado === ESTADO.DESTAPADA) nombre = c.num > 0 ? FICHAS.numero(c.num) : FICHAS.limpio;
      else if (c.estado === ESTADO.MINA) nombre = FICHAS.mina;
      else if (c.marca === MARCAS.DUDA) nombre = FICHAS.duda;
      else if (c.marca === MARCAS.SEGURO) nombre = FICHAS.seguro;
      if (!nombre) continue;
      const img = fichas.get(nombre);
      if (!img) continue;
      ctx.drawImage(img, sx - anchoFicha / 2, sy - altoFicha / 2, anchoFicha, altoFicha);
    }

    if (resaltada >= 0 && partida.celdas[resaltada]) {
      const c = partida.celdas[resaltada];
      const cx = ox + c.x * escala;
      const cy = oy + c.y * escala;
      const w2 = anchoFicha / 2;
      const h2 = altoFicha / 2;
      ctx.beginPath();
      ctx.moveTo(cx + w2, cy);
      ctx.lineTo(cx + w2 / 2, cy + h2);
      ctx.lineTo(cx - w2 / 2, cy + h2);
      ctx.lineTo(cx - w2, cy);
      ctx.lineTo(cx - w2 / 2, cy - h2);
      ctx.lineTo(cx + w2 / 2, cy - h2);
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
