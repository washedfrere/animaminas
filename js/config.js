/**
 * Animaminas — configuración y textos.
 * Un único sitio para constantes de juego y cadenas de la interfaz (español).
 */

export const CONFIG = {
  vidasIniciales: 3,

  /** ms que se espera un toque antes de poner la marca (para detectar el doble toque). */
  retardoToque: 280,
  /** ms de pulsación continua que equivale a marcar. */
  pulsacionLarga: 450,
  /** px de movimiento que anulan un toque (para distinguirlo de un arrastre). */
  umbralArrastre: 9,
  /** px de movimiento que ya cancelan la pulsación larga (dedo tembloroso). */
  umbralPulsacion: 4,

  puntosBase: { 1: 300, 2: 600, 3: 1000, 4: 1500 },
  penalizacionIntento: 100,
  penalizacionMarca: 25,

  /** Ampliación máxima del tablero dentro de la ventana (1 = celda nativa de 58×52). */
  zoomMaximo: 2,
};

export const RUTAS = {
  datos: "data/levels.json",
  fondo: (nivel) => `assets/fondo/nivel${nivel}.webp`,
  ficha: (nombre, x2 = true) => `assets/fichas/${nombre}${x2 ? "@2x" : ""}.webp`,
  musica: "assets/audio/background_music.mp3",
  iconoSonido: {
    on: "assets/iconos/with_sound.webp",
    off: "assets/iconos/no_sound.webp",
  },
};

export const FICHAS = {
  limpio: "limpio",
  duda: "marca",
  seguro: "seguro",
  mina: "mina",
  numero: (n) => `numero${n}`,
};

export const TEXTO = {
  nivel: (n, nombre) => `Nivel ${n} · ${nombre}`,
  celdas: (n) => `${n} casillas`,
  minas: (n) => `${n} minas`,
  tiempo: "tiempo",
  minasRestantes: "minas",
  victoria: "¡Tablero resuelto!",
  derrota: "Te has quedado sin vidas",
  puntos: (p) => `${p} puntos`,
  avisoBombasDeMas: "Has señalado más bombas de las que hay",
  avisoTodoDestapado: "Todo destapado: marca las bombas con seguro",
  avisoDuda: "Duda pendiente: conviértela en seguro o quítala para poder terminar",
  repetir: "Repetir tablero",
  nuevo: "Nuevo tablero",
  inicio: "Volver al inicio",
  ranking: "Ver ranking",
  rankingVacio: "Todavía no hay partidas terminadas.",
  borrarRanking: "Borrar ranking",
  confirmarBorrado: "¿Seguro que quieres borrar todas las puntuaciones?",
  ayudaTitulo: "Cómo se juega",
  ayuda: [
    "Un toque (o clic) sobre un hexágono oculto va cambiando su marca: nada → ! (seguro) → ? (duda) → nada.",
    "Dos toques seguidos destapan la casilla. Si tiene un seguro (!), el doble toque lo quita.",
    "Arrastra con un dedo para mover la ventana; pellizca o usa la rueda para acercar, y ⤢ para ver el tablero entero.",
    "Una casilla con marca no se destapa: quita antes la marca.",
    "Al destapar una casilla sin bombas alrededor, se limpian las vecinas de golpe.",
    "Cuando pisas una bomba, las casillas de alrededor muestran cuántas bombas tienen al lado.",
    "Ganas cuando TODAS las bombas llevan seguro (!) y no queda ninguna duda ni ningún seguro en una casilla vacía.",
    "Ojo: si dejas una duda (?) y tocas otra casilla, esa duda resta puntos.",
    "Consejo: mantener pulsado también marca, sin esperar.",
  ],
};
