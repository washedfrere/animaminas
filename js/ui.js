/** Elementos de interfaz: pantallas, HUD, paneles y ranking. */

import { CONFIG, TEXTO } from "./config.js";

export const $ = (id) => document.getElementById(id);

export function mostrarPantalla(nombre) {
  for (const p of document.querySelectorAll(".pantalla")) {
    p.hidden = p.id !== `pantalla-${nombre}`;
  }
}

export function formatearTiempo(segundos) {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function pintarVidas(contenedor, vidas, maximo = CONFIG.vidasIniciales) {
  contenedor.innerHTML = "";
  for (let i = 0; i < maximo; i += 1) {
    const span = document.createElement("span");
    span.textContent = "♥";
    span.className = i < vidas ? "" : "vida-perdida";
    contenedor.appendChild(span);
  }
}

export function pintarNiveles(contenedor, niveles, alElegir) {
  contenedor.innerHTML = "";
  for (const nivel of niveles) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "nivel";
    boton.innerHTML = `
      <span class="nivel__numero">Nivel ${nivel.id}</span>
      <span class="nivel__nombre">${nivel.nombre}</span>
      <span class="nivel__datos">${TEXTO.celdas(nivel.celdas.length)} · ${TEXTO.minas(nivel.minas)}${nivel.cronometro ? " · cronómetro" : ""}</span>
    `;
    boton.addEventListener("click", () => alElegir(nivel));
    contenedor.appendChild(boton);
  }
}

let panelAccionPrevia = null;

export function abrirPanel({ titulo, cuerpo, acciones = [] }) {
  const panel = $("panel");
  $("panel-titulo").textContent = titulo;
  const cont = $("panel-cuerpo");
  cont.innerHTML = "";
  if (typeof cuerpo === "string") cont.innerHTML = cuerpo;
  else if (cuerpo) cont.appendChild(cuerpo);
  const accionesEl = $("panel-acciones");
  accionesEl.innerHTML = "";
  for (const accion of acciones) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `boton ${accion.tipo ?? ""}`.trim();
    b.textContent = accion.texto;
    b.addEventListener("click", () => {
      cerrarPanel();
      accion.accion?.();
    });
    accionesEl.appendChild(b);
  }
  panel.hidden = false;
  panelAccionPrevia = accionesEl.querySelector("button");
  panelAccionPrevia?.focus();
}

export function cerrarPanel() {
  $("panel").hidden = true;
}

export function panelAbierto() {
  return !$("panel").hidden;
}

export function pintarRanking(contenedor, niveles, ranking) {
  contenedor.innerHTML = "";
  let alguno = false;
  for (const nivel of niveles) {
    const lista = ranking[nivel.id] ?? [];
    const bloque = document.createElement("div");
    bloque.className = "ranking__nivel";
    const titulo = document.createElement("h3");
    titulo.textContent = `${TEXTO_nivel(nivel)}`;
    bloque.appendChild(titulo);
    if (!lista.length) {
      const p = document.createElement("p");
      p.className = "ranking__vacio";
      p.textContent = TEXTO.rankingVacio;
      bloque.appendChild(p);
    } else {
      alguno = true;
      const tabla = document.createElement("table");
      tabla.className = "ranking__tabla";
      tabla.innerHTML = `<thead><tr><th>#</th><th>Puntos</th><th>Tiempo</th><th>Intentos</th><th>Dudas</th></tr></thead>`;
      const tbody = document.createElement("tbody");
      lista.forEach((fila, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${i + 1}</td><td>${fila.puntos}</td><td>${formatearTiempo(fila.tiempo)}</td>` +
          `<td>${fila.intentos}</td><td>${fila.dudas ?? fila.marcas ?? 0}</td>`;
        tbody.appendChild(tr);
      });
      tabla.appendChild(tbody);
      bloque.appendChild(tabla);
    }
    contenedor.appendChild(bloque);
  }
  return alguno;
}

function TEXTO_nivel(nivel) {
  return `${nivel.id}. ${nivel.nombre}`;
}
