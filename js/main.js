/**
 * Animaminas — arranque y orquestación de pantallas.
 */

import { CONFIG, TEXTO, RUTAS } from "./config.js";
import {
  crearPartida, destapar, marcar, segundos, calcularPuntos, minasRestantes,
  FIN, ESTADO,
} from "./board.js";
import { crearRender } from "./render.js";
import { conectarEntrada } from "./input.js";
import { crearAudio } from "./audio.js";
import { leerRanking, anotarPuntuacion, borrarRanking, mejorPuntuacion } from "./score.js";
import * as UI from "./ui.js";

const estado = {
  niveles: [],
  nivel: null,
  partida: null,
  render: null,
  entrada: null,
  reloj: null,
  pistaVisible: true,
};

const audio = crearAudio();
let render = null;

const PISTA_INICIAL = "Un toque: ! → ? → nada · doble toque destapa";

function vibrar(ms) {
  try { navigator.vibrate?.(ms); } catch { /* sin soporte */ }
}

/* ------------------------------------------------------------------ arranque */

async function iniciar() {
  try {
    const respuesta = await fetch(RUTAS.datos);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    estado.niveles = datos.niveles.map((nivel) => ({ ...nivel, hexagono: datos.hexagono }));
  } catch (error) {
    UI.abrirPanel({
      titulo: "No se pudo cargar el juego",
      cuerpo: `<p>${escapeHtml(error.message)}</p><p>Comprueba que la app se sirve desde su carpeta.</p>`,
      acciones: [{ texto: "Reintentar", accion: () => location.reload() }],
    });
    return;
  }

  const lienzo = UI.$("lienzo");
  const caja = UI.$("lienzo-caja");
  render = crearRender(lienzo, caja, {
    alCambiarVista: () => { if (estado.partida) dibujar(); },
  });
  estado.render = render;

  conectarSonido();
  pintarInicio();
  conectarBotones();
  registrarServiceWorker();

  let pendiente = null;
  const reajustar = () => {
    clearTimeout(pendiente);
    pendiente = setTimeout(() => {
      render.redimensionar();
      if (estado.partida) dibujar();
    }, 120);
  };
  window.addEventListener("resize", reajustar);
  window.addEventListener("orientationchange", reajustar);

  // Cualquier cambio de tamaño de la caja (barra de direcciones, pista, rotación) tiene que
  // rehacer el búfer del canvas; si no, el navegador lo estira y el toque se desplaza.
  if ("ResizeObserver" in window) {
    const observador = new ResizeObserver(() => {
      render.redimensionar();
      if (estado.partida) dibujar();
    });
    observador.observe(caja);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) audio.pausar();
    else if (!UI.$("pantalla-juego").hidden) audio.reanudar();
  });

  UI.mostrarPantalla("inicio");

  // enlace directo: index.html#nivel=3  |  index.html#ranking
  const enlace = /nivel=([1-4])/.exec(location.hash);
  if (enlace) {
    const nivel = estado.niveles.find((n) => n.id === Number(enlace[1]));
    if (nivel) empezarNivel(nivel);
  } else if (location.hash === "#ranking") {
    abrirRanking();
  }
}

function escapeHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

if (new URLSearchParams(location.search).has("diag")) {
  window.addEventListener("error", (ev) => {
    const pista = document.getElementById("pista");
    if (!pista) return;
    pista.hidden = false;
    pista.textContent = `ERROR: ${ev.message} @ ${ev.filename}:${ev.lineno}`;
  });
}

/* ------------------------------------------------------------------- inicio */

function pintarInicio() {
  UI.pintarNiveles(UI.$("lista-niveles"), estado.niveles, (nivel) => empezarNivel(nivel));
  for (const nivel of estado.niveles) {
    const boton = UI.$("lista-niveles").querySelectorAll(".nivel")[nivel.id - 1];
    const mejor = mejorPuntuacion(nivel.id);
    if (boton && mejor !== null) {
      const marca = document.createElement("span");
      marca.className = "nivel__datos";
      marca.textContent = `Récord: ${mejor} pts`;
      boton.appendChild(marca);
    }
  }
  if (DEPURACION) {
    const pista = UI.$("pista");
    pista.hidden = false;
    pista.textContent = `DIAG inicio: niveles=${estado.niveles.length} botones=${UI.$("lista-niveles").children.length}`;
  }
}

function conectarBotones() {
  UI.$("btn-volver").addEventListener("click", () => irAInicio());
  UI.$("btn-nuevo").addEventListener("click", () => empezarNivel(estado.nivel, {}));
  UI.$("btn-repetir").addEventListener("click", () => repetirTablero());
  UI.$("btn-ranking").addEventListener("click", abrirRanking);
  UI.$("btn-ranking-volver").addEventListener("click", () => irAInicio());
  UI.$("btn-ayuda").addEventListener("click", mostrarAyuda);
  UI.$("btn-borrar-ranking").addEventListener("click", confirmarBorrado);
}

function irAInicio() {
  detenerReloj();
  UI.cerrarPanel();
  UI.mostrarPantalla("inicio");
  audio.reanudar();
  pintarInicio();
}

/* -------------------------------------------------------------------- juego */

async function empezarNivel(nivel, { minas = null, intentos = 1 } = {}) {
  if (!nivel) return;
  estado.nivel = nivel;
  UI.cerrarPanel();
  UI.mostrarPantalla("juego");
  UI.$("pantalla-juego").hidden = false;

  try {
    await render.cargarFichas();
    await render.cargarNivel(nivel);
  } catch (error) {
    UI.abrirPanel({
      titulo: "Faltan recursos",
      cuerpo: `<p>No se han podido cargar las imágenes del nivel.</p><p><code>${escapeHtml(error.message)}</code></p>`,
      acciones: [{ texto: "Volver", accion: () => irAInicio() }],
    });
    return;
  }

  estado.partida = crearPartida(nivel, { minas, intentos });
  estado.pistaVisible = true;
  UI.$("pista").classList.remove("pista--aviso");
  ponerPista(PISTA_INICIAL);
  clearTimeout(temporizadorAviso);
  UI.$("hud-nivel").textContent = TEXTO.nivel(nivel.id, nivel.nombre);
  UI.$("marcador-tiempo").hidden = !nivel.cronometro;

  // el lienzo necesita un frame para tener tamaño
  requestAnimationFrame(() => {
    render.redimensionar();
    render.reiniciarVista();
    dibujar();
  });

  estado.entrada?.destruir();
  estado.entrada = conectarEntrada({
    lienzo: UI.$("lienzo"),
    render,
    obtenerPartida: () => estado.partida,
    alDestapar: intentarDestapar,
    alMarcar: intentarMarcar,
    alCambiarSeleccion: () => dibujar(),
  });
  estado.entrada.fijarSeleccion(-1);

  actualizarHud();
  arrancarReloj();
  audio.reanudar();
  UI.$("lienzo").focus();
}

function repetirTablero() {
  if (!estado.partida) return;
  empezarNivel(estado.nivel, {
    minas: [...estado.partida.indicesMinas],
    intentos: estado.partida.intentos + 1,
  });
  vibrar(15);
}

function dibujar() {
  if (!estado.partida) return;
  render.dibujar(estado.partida, { resaltada: estado.entrada?.seleccion() ?? -1 });
  if (DEPURACION) {
    const pista = UI.$("pista");
    pista.hidden = false;
    const v = render.vistaActual();
    const cuenta = {};
    for (const c of estado.partida.celdas) cuenta[c.estado] = (cuenta[c.estado] ?? 0) + 1;
    pista.textContent = JSON.stringify({
      ...v, caja: estado.nivel.caja, estados: cuenta,
      niveles: estado.niveles.length,
      botones: UI.$("lista-niveles").children.length,
    });
  }
}

const DEPURACION = new URLSearchParams(location.search).has("diag");

function intentarDestapar(indice) {
  if (UI.panelAbierto() || !estado.partida) return;
  audio.desbloquear();
  const resultado = destapar(estado.partida, indice);
  if (resultado.tipo === "nada") return;
  ocultarPista();
  if (resultado.tipo === "mina") {
    audio.golpe();
    vibrar(140);
  }
  tratarAvisos(resultado.avisos);
  dibujar();
  actualizarHud();
  if (estado.partida.estado !== FIN.JUGANDO) terminarPartida();
}

function intentarMarcar(indice) {
  if (UI.panelAbierto() || !estado.partida) return;
  audio.desbloquear();
  const resultado = marcar(estado.partida, indice);
  if (resultado.cambio) {
    ocultarPista();
    tratarAvisos(resultado.avisos);
    dibujar();
    actualizarHud();
    if (estado.partida.estado !== FIN.JUGANDO) terminarPartida();
  }
}

function tratarAvisos(avisos = []) {
  const textos = {
    bombasDeMas: TEXTO.avisoBombasDeMas,
    todoDestapado: TEXTO.avisoTodoDestapado,
  };
  const primero = avisos.map((a) => textos[a]).filter(Boolean)[0];
  if (primero) mostrarAviso(primero);
}

let temporizadorAviso = null;

/** Muestra un texto en la franja inferior sin cambiar el alto del lienzo. */
function ponerPista(texto) {
  const pista = UI.$("pista");
  pista.textContent = texto;
  pista.title = texto;
  pista.classList.remove("pista--oculta");
}

function mostrarAviso(texto) {
  const pista = UI.$("pista");
  ponerPista(texto);
  pista.classList.add("pista--aviso");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    pista.classList.remove("pista--aviso");
    if (estado.pistaVisible) {
      ponerPista(PISTA_INICIAL);
    } else {
      pista.classList.add("pista--oculta");
    }
  }, 5000);
}

function ocultarPista() {
  if (!estado.pistaVisible) return;
  estado.pistaVisible = false;
  const pista = UI.$("pista");
  if (!pista.classList.contains("pista--aviso")) pista.classList.add("pista--oculta");
}

function actualizarHud() {
  const p = estado.partida;
  if (!p) return;
  UI.pintarVidas(UI.$("hud-vidas"), p.vidas);
  UI.$("hud-minas").textContent = minasRestantes(p);
  if (p.nivel.cronometro) UI.$("hud-tiempo").textContent = UI.formatearTiempo(segundos(p));
}

function arrancarReloj() {
  detenerReloj();
  if (!estado.nivel?.cronometro) return;
  estado.reloj = setInterval(() => {
    if (!estado.partida) return;
    UI.$("hud-tiempo").textContent = UI.formatearTiempo(segundos(estado.partida));
  }, 500);
}

function detenerReloj() {
  if (estado.reloj) clearInterval(estado.reloj);
  estado.reloj = null;
}

function terminarPartida() {
  const p = estado.partida;
  detenerReloj();
  const gano = p.estado === FIN.VICTORIA;
  const tiempo = segundos(p);

  if (gano) {
    const puntos = calcularPuntos(p, tiempo);
    anotarPuntuacion(p.nivel.id, {
      puntos, tiempo, intentos: p.intentos, dudas: p.dudas,
    });
    vibrar([20, 60, 20]);
    UI.abrirPanel({
      titulo: TEXTO.victoria,
      cuerpo: `
        <p><strong>${puntos} puntos</strong></p>
        <p>${p.nivel.cronometro ? `Tiempo: ${UI.formatearTiempo(tiempo)} · ` : ""}Intentos: ${p.intentos} · Dudas: ${p.dudas}</p>
        <p>Has señalado las ${p.minasTotales} bombas.</p>
      `,
      acciones: [
        { texto: TEXTO.repetir, accion: repetirTablero },
        { texto: TEXTO.nuevo, tipo: "boton--principal", accion: () => empezarNivel(estado.nivel, {}) },
        { texto: TEXTO.inicio, tipo: "boton--fantasma", accion: irAInicio },
      ],
    });
  } else {
    vibrar(220);
    UI.abrirPanel({
      titulo: TEXTO.derrota,
      cuerpo: `<p>Has pisado 3 minas. Este tablero se te ha resistido.</p>
               <p>Intentos en este tablero: ${p.intentos}</p>`,
      acciones: [
        { texto: TEXTO.repetir, tipo: "boton--principal", accion: repetirTablero },
        { texto: TEXTO.nuevo, accion: () => empezarNivel(estado.nivel, {}) },
        { texto: TEXTO.inicio, tipo: "boton--fantasma", accion: irAInicio },
      ],
    });
  }
}

/* ------------------------------------------------------------------ ranking */

function abrirRanking() {
  UI.mostrarPantalla("ranking");
  UI.pintarRanking(UI.$("ranking-contenido"), estado.niveles, leerRanking());
}

function confirmarBorrado() {
  UI.abrirPanel({
    titulo: "Borrar ranking",
    cuerpo: `<p>${TEXTO.confirmarBorrado}</p>`,
    acciones: [
      { texto: "Cancelar", tipo: "boton--fantasma", accion: () => {} },
      {
        texto: "Borrar",
        tipo: "boton--peligro",
        accion: () => {
          borrarRanking();
          UI.pintarRanking(UI.$("ranking-contenido"), estado.niveles, leerRanking());
        },
      },
    ],
  });
}

/* -------------------------------------------------------------------- ayuda */

function mostrarAyuda() {
  UI.abrirPanel({
    titulo: TEXTO.ayudaTitulo,
    cuerpo: `<ul>${TEXTO.ayuda.map((t) => `<li>${t}</li>`).join("")}</ul>`,
    acciones: [{ texto: "Entendido", tipo: "boton--principal", accion: () => {} }],
  });
}

/* --------------------------------------------------------------------- audio */

function conectarSonido() {
  const boton = UI.$("btn-sonido");
  const icono = UI.$("icono-sonido");
  const pintar = (activo) => {
    icono.src = activo ? RUTAS.iconoSonido.on : RUTAS.iconoSonido.off;
    boton.setAttribute("aria-pressed", String(activo));
    boton.setAttribute("aria-label", activo ? "Desactivar la música" : "Activar la música");
  };
  pintar(audio.activo());
  boton.addEventListener("click", () => {
    audio.desbloquear();
    pintar(audio.alternar());
  });
  // el primer gesto en cualquier sitio desbloquea la música
  const desbloquear = () => {
    audio.desbloquear();
    window.removeEventListener("pointerdown", desbloquear, true);
    window.removeEventListener("keydown", desbloquear, true);
  };
  window.addEventListener("pointerdown", desbloquear, true);
  window.addEventListener("keydown", desbloquear, true);
}

/* ------------------------------------------------------------------------ PWA */

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const registrar = () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* sin soporte o sin HTTPS */ });
  };
  registrar();
  window.addEventListener("load", registrar);
}

/* ------------------------------------------------------------------ QA hooks */

// API mínima para pruebas automatizadas y capturas (no se usa en el juego).
window.animaminas = {
  estado,
  revelar: (i) => intentarDestapar(i),
  marcar: (i) => intentarMarcar(i),
  dibujar,
  posicion: (i) => render.posicionCelda(estado.partida.celdas[i]),
  vista: () => render.vistaActual(),
  dibujos: () => render.dibujos(),
};

iniciar();
