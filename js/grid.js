/**
 * Geometría de la rejilla hexagonal.
 *
 * La plantilla tiene hexágonos con los lados superior e inferior horizontales y las
 * columnas contrapeadas verticalmente: la columna `c` empieza en
 * `y = origen.y + (c % 2) * desfase`, y las filas avanzan de `paso.y` en `paso.y`.
 *
 * Cada celda se identifica por (col, fila). Las distancias entre centros vecinos son
 * iguales en las seis direcciones, así que para saber qué casilla se ha pulsado basta
 * con buscar el centro más cercano.
 */

export const clave = (col, fila) => `${col},${fila}`;

/** Desplazamientos (dcol, dfila) de las seis vecinas, según la paridad de la columna. */
export function desplazamientosVecinas(col) {
  const par = col % 2 === 0;
  const dfilaDiagonal = par ? -1 : 1;
  return [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
    [-1, dfilaDiagonal],
    [1, dfilaDiagonal],
  ];
}

/** Claves de las vecinas que existen en el mapa dado. */
export function vecinasDe(mapa, col, fila) {
  const salida = [];
  for (const [dc, df] of desplazamientosVecinas(col)) {
    const k = clave(col + dc, fila + df);
    if (mapa.has(k)) salida.push(k);
  }
  return salida;
}

/**
 * Índice de la celda cuyo centro está más cerca del punto (x, y) en coordenadas de
 * la imagen de fondo del nivel. Devuelve -1 si el punto queda demasiado lejos.
 */
export function celdaEnPunto(celdas, x, y, radioMaximo = 40) {
  let mejor = -1;
  let mejorDist = radioMaximo * radioMaximo;
  for (let i = 0; i < celdas.length; i += 1) {
    const c = celdas[i];
    const dx = c.x - x;
    const dy = c.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < mejorDist) {
      mejorDist = d2;
      mejor = i;
    }
  }
  return mejor;
}

/** Caja que contiene todos los centros (útil para encuadrar el tablero). */
export function limites(celdas, hexagono) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of celdas) {
    x0 = Math.min(x0, c.x - hexagono.ancho / 2);
    y0 = Math.min(y0, c.y - hexagono.alto / 2);
    x1 = Math.max(x1, c.x + hexagono.ancho / 2);
    y1 = Math.max(y1, c.y + hexagono.alto / 2);
  }
  return { x0, y0, x1, y1, ancho: x1 - x0, alto: y1 - y0 };
}
