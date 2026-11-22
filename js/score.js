/** Puntuaciones y ranking local (top 10 por nivel). */

import { leer, escribir, borrar } from "./storage.js";

const CLAVE = "ranking";
const MAXIMO = 10;

/** @returns {Record<number, Array>} ranking por nivel */
export function leerRanking() {
  const datos = leer(CLAVE, {});
  return datos && typeof datos === "object" ? datos : {};
}

export function anotarPuntuacion(nivelId, entrada) {
  const ranking = leerRanking();
  const lista = Array.isArray(ranking[nivelId]) ? ranking[nivelId] : [];
  lista.push({ ...entrada, fecha: entrada.fecha ?? Date.now() });
  lista.sort((a, b) => b.puntos - a.puntos || a.tiempo - b.tiempo);
  ranking[nivelId] = lista.slice(0, MAXIMO);
  escribir(CLAVE, ranking);
  return ranking[nivelId];
}

export function borrarRanking() {
  borrar(CLAVE);
}

export function mejorPuntuacion(nivelId) {
  const lista = leerRanking()[nivelId];
  return Array.isArray(lista) && lista.length ? lista[0].puntos : null;
}
