/**
 * Dibujo del tablero en canvas.
 *
 * Modelo de vista: una **ventana** fija (*playzone*) sobre el tablero real. El tablero se
 * dibuja a escala `Z` (1 = tamaño nativo de la celda, 58×52) dentro de la ventana, y se
 * arrastra para recorrerlo. La ventana es como mucho el tamaño del playzone y nunca mayor
 * que el lienzo disponible (opción C): en móvil manda la pantalla.
 *
 * Se dibuja directamente al canvas, recortando a la ventana. Los repintados solo ocurren
 * cuando algo cambia (juego, arrastre o zoom), nunca en un bucle continuo.
 */

import { CONFIG, RUTAS, FICHAS } from "./config.js";
import { ESTADO, MARCAS } from "./board.js";

const NOMBRES_FICHAS = ["limpio", "marca", "seguro", "mina", "numero1", "numero2", "numero3",
  "numero4", "numero5", "numero6"];

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
  const vista = { escala: 1, x: 0, y: 0 };     // origen del tablero relativo a la ventana
  const estado = { anchoCss: 1, altoCss: 1, dpr: 1 };
  const ventana = { x: 0, y: 0, ancho: 1, alto: 1 };
  let playzone = { ancho: 910, alto: 962 };
  let celdaActiva = { ancho: 44, alto: 30 };
  let celdaSolapada = { ancho: 58, alto: 52 };
  let nivelActual = null;
  let fondoActual = null;
  let encaje = 1;                 // escala a la que el tablero cabe entero en la ventana
  let cuadroPedido = 0;
  let contadorDibujos = 0;
  const alCambiarVista = opciones.alCambiarVista ?? null;

  function configurar({ playzone: pz, celda } = {}) {
    if (pz) playzone = { ancho: pz.ancho, alto: pz.alto };
    if (celda?.activa) celdaActiva = { ancho: celda.activa.ancho, alto: celda.activa.alto };
    if (celda?.solapada) celdaSolapada = { ancho: celda.solapada.ancho, alto: celda.solapada.alto };
    calcularVentana();
  }

  /** Pide un repintado para el siguiente frame (como mucho uno por frame). */
  function pedirDibujo() {
    if (cuadroPedido) return;
    cuadroPedido = requestAnimationFrame(() => {
      cuadroPedido = 0;
      alCambiarVista?.();
    });
  }

  /** La ventana es el playzone, recortado al espacio disponible y centrado. */
  function calcularVentana() {
    const ancho = Math.max(1, Math.min(playzone.ancho, estado.anchoCss));
    const alto = Math.max(1, Math.min(playzone.alto, estado.altoCss));
    ventana.ancho = ancho;
    ventana.alto = alto;
    ventana.x = Math.round((estado.anchoCss - ancho) / 2);
    ventana.y = Math.round((estado.altoCss - alto) / 2);
  }

  function escalaMinima() {
    if (!nivelActual) return 1;
    const ajuste = Math.min(ventana.ancho / nivelActual.ancho, ventana.alto / nivelActual.alto);
    return Math.min(1, ajuste);
  }

  function escalaMaxima() {
    return Math.max(escalaMinima(), CONFIG.zoomMaximo);
  }

  /** Encaja el tablero dentro de la ventana (lo que hace el botón ⤢). */
  function encuadrarTodo() {
    if (!nivelActual) return;
    vista.escala = encaje;
    vista.x = (ventana.ancho - nivelActual.ancho * vista.escala) / 2;
    vista.y = (ventana.alto - nivelActual.alto * vista.escala) / 2;
    limitarVista();
  }

  /** Vista normal: celda a tamaño nativo, centrada en una casilla. */
  function vistaNormal(celda) {
    if (!nivelActual) return;
    vista.escala = 1;
    const c = celda ?? { x: nivelActual.ancho / 2, y: nivelActual.alto / 2 };
    vista.x = ventana.ancho / 2 - c.x;
    vista.y = ventana.alto / 2 - c.y;
    limitarVista();
  }

  function limitarVista() {
    if (!nivelActual) return;
    const w = nivelActual.ancho * vista.escala;
    const h = nivelActual.alto * vista.escala;
    if (w <= ventana.ancho) vista.x = (ventana.ancho - w) / 2;
    else vista.x = Math.min(0, Math.max(ventana.ancho - w, vista.x));
    if (h <= ventana.alto) vista.y = (ventana.alto - h) / 2;
    else vista.y = Math.min(0, Math.max(ventana.alto - h, vista.y));
  }

  /** Desplaza la vista lo justo para que la casilla quede dentro (teclado). */
  function asegurarVisible(celda) {
    if (!celda || !nivelActual) return;
    const margen = 48;
    const sx = vista.x + celda.x * vista.escala;
    const sy = vista.y + celda.y * vista.escala;
    let cambio = false;
    if (sx < margen) { vista.x += margen - sx; cambio = true; }
    else if (sx > ventana.ancho - margen) { vista.x -= sx - (ventana.ancho - margen); cambio = true; }
    if (sy < margen) { vista.y += margen - sy; cambio = true; }
    else if (sy > ventana.alto - margen) { vista.y -= sy - (ventana.alto - margen); cambio = true; }
    if (cambio) {
      limitarVista();
      pedirDibujo();
    }
  }

  function redimensionar() {
    const r = caja.getBoundingClientRect();
    const anterior = { ...estado };
    const teniaVista = Boolean(nivelActual && anterior.anchoCss > 1);

    estado.anchoCss = Math.max(1, Math.round(r.width));
    estado.altoCss = Math.max(1, Math.round(r.height));
    estado.dpr = Math.min(window.devicePixelRatio || 1, 2);
    lienzo.width = Math.round(estado.anchoCss * estado.dpr);
    lienzo.height = Math.round(estado.altoCss * estado.dpr);
    calcularVentana();

    if (!nivelActual) return;
    if (teniaVista) {
      // conserva la escala y el punto del tablero que había en el centro de la ventana
      const centroX = (ventana.ancho / 2 - vista.x) / vista.escala;
      const centroY = (ventana.alto / 2 - vista.y) / vista.escala;
      encaje = Math.min(ventana.ancho / nivelActual.ancho, ventana.alto / nivelActual.alto);
      vista.escala = Math.min(escalaMaxima(), Math.max(escalaMinima(), vista.escala));
      vista.x = ventana.ancho / 2 - centroX * vista.escala;
      vista.y = ventana.alto / 2 - centroY * vista.escala;
    } else {
      encaje = Math.min(ventana.ancho / nivelActual.ancho, ventana.alto / nivelActual.alto);
      vistaNormal();
    }
    limitarVista();
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
    const ruta = nivel.fondo ?? RUTAS.fondo(nivel.id);
    if (!fondos.has(ruta)) {
      fondos.set(ruta, await cargarImagen(ruta));
      while (fondos.size > 2) {
        const primera = fondos.keys().next().value;
        if (primera === ruta) break;
        fondos.delete(primera);
      }
    }
    fondoActual = fondos.get(ruta);
    calcularVentana();
    encaje = Math.min(ventana.ancho / nivel.ancho, ventana.alto / nivel.alto);
    vistaNormal();
  }

  /* ------------------------------------------------------------------- dibujo */

  function nombreFicha(c) {
    if (c.estado === ESTADO.DESTAPADA) return c.num > 0 ? FICHAS.numero(c.num) : FICHAS.limpio;
    if (c.estado === ESTADO.MINA) return FICHAS.mina;
    if (c.marca === MARCAS.DUDA) return FICHAS.duda;
    if (c.marca === MARCAS.SEGURO) return FICHAS.seguro;
    return null;
  }

  function dibujar(partida, opcionesDibujo = {}) {
    const { debug = false, resaltada = -1 } = opcionesDibujo;
    contadorDibujos += 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.setTransform(estado.dpr, 0, 0, estado.dpr, 0, 0);
    if (!nivelActual || !fondoActual) return;

    const escala = vista.escala;
    const ox = ventana.x + vista.x;
    const oy = ventana.y + vista.y;
    const anchoTablero = nivelActual.ancho * escala;
    const altoTablero = nivelActual.alto * escala;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ventana.x, ventana.y, ventana.ancho, ventana.alto);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(fondoActual, ox, oy, anchoTablero, altoTablero);

    const anchoFicha = celdaSolapada.ancho * escala;
    const altoFicha = celdaSolapada.alto * escala;
    const margen = Math.max(anchoFicha, altoFicha);
    for (const c of partida.celdas) {
      const sx = ox + c.x * escala;
      const sy = oy + c.y * escala;
      if (sx < ventana.x - margen || sy < ventana.y - margen
        || sx > ventana.x + ventana.ancho + margen || sy > ventana.y + ventana.alto + margen) {
        continue;
      }
      const nombre = nombreFicha(c);
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
    ctx.restore();

    // marco de la ventana
    ctx.strokeStyle = "rgba(120, 170, 200, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ventana.x + 0.5, ventana.y + 0.5, ventana.ancho - 1, ventana.alto - 1);
  }

  /* -------------------------------------------------------------- pulsación */

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

  /** Coordenadas de pantalla → coordenadas de la imagen del nivel. */
  function aImagen(clientX, clientY) {
    const r = lienzo.getBoundingClientRect();
    const f = factorBuffer(r);
    const cssX = ((clientX - r.left) * f.x) / estado.dpr;
    const cssY = ((clientY - r.top) * f.y) / estado.dpr;
    const dentro = cssX >= ventana.x && cssX <= ventana.x + ventana.ancho
      && cssY >= ventana.y && cssY <= ventana.y + ventana.alto;
    return {
      x: (cssX - ventana.x - vista.x) / vista.escala,
      y: (cssY - ventana.y - vista.y) / vista.escala,
      fuera: !dentro,
    };
  }

  /** Coordenadas de pantalla (cliente) del centro de una celda. */
  function posicionCelda(celda) {
    const r = lienzo.getBoundingClientRect();
    const f = factorBuffer(r);
    const cssX = ventana.x + vista.x + celda.x * vista.escala;
    const cssY = ventana.y + vista.y + celda.y * vista.escala;
    return {
      x: r.left + (cssX * estado.dpr) / f.x,
      y: r.top + (cssY * estado.dpr) / f.y,
    };
  }

  /* ------------------------------------------------------------- zoom y pan */

  function zoomEn(factor, clientX, clientY) {
    const r = lienzo.getBoundingClientRect();
    const f = factorBuffer(r);
    const px = ((clientX - r.left) * f.x) / estado.dpr - ventana.x;
    const py = ((clientY - r.top) * f.y) / estado.dpr - ventana.y;
    const nueva = Math.min(escalaMaxima(), Math.max(escalaMinima(), vista.escala * factor));
    if (nueva === vista.escala) return;
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
    return {
      escala: vista.escala,
      x: vista.x,
      y: vista.y,
      minimo: escalaMinima(),
      maximo: escalaMaxima(),
      encaje,
      ventana: { ...ventana },
      anchoCss: estado.anchoCss,
      altoCss: estado.altoCss,
    };
  }

  return {
    configurar,
    cargarFichas,
    cargarNivel,
    dibujar,
    aImagen,
    posicionCelda,
    zoomEn,
    desplazar,
    vistaActual,
    redimensionar,
    encuadrarTodo,
    vistaNormal,
    asegurarVisible,
    pedirDibujo,
    celdaActiva: () => ({ ...celdaActiva }),
    ventanaActual: () => ({ ...ventana }),
    dibujos: () => contadorDibujos,
  };
}
