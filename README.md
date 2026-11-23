# Animaminas

Buscaminas **hexagonal** como PWA: un toque marca, dos toques destapan, tres vidas y cuatro
niveles que se recorren arrastrando una ventana sobre el tablero.

Sin dependencias y sin build: HTML + CSS + JavaScript (módulos) + Canvas 2D + Service Worker.
Este repositorio contiene **la app ya lista para publicar**; GitHub Pages la sirve desde la raíz.

## Jugar

<https://washedfrere.github.io/animaminas/>

En el móvil: en Android aparece el botón "Instalar app"; en iPhone, ábrela con Safari →
Compartir → **Añadir a pantalla de inicio**. Después de la primera carga funciona sin conexión.

También se puede servir en local:

```bash
python -m http.server 8099 --directory .
```

## Cómo se juega

| Acción | Efecto |
|---|---|
| Un toque / clic | Cicla la marca: nada → ! (seguro) → ? (duda) → nada |
| Mantener pulsado | Un paso más del ciclo de marca |
| Dos toques seguidos | Destapa la casilla; sobre un ! lo quita y la deja sin marca |
| Arrastrar | Mueve la ventana sobre el tablero |
| Pellizco / rueda | Acerca o aleja el tablero dentro de la ventana |
| ⤢ | Encaja el tablero completo / vuelve al tamaño normal |
| Flechas + Enter / Espacio | Jugar con teclado |

La ventana de juego es fija (como mucho 910×962 px, o la pantalla si es menor): los tableros
grandes se recorren arrastrando, con la celda siempre al mismo tamaño.

Se empieza con **3 vidas** y una casilla ya destapada (la de más minas alrededor). Al pisar una
mina se pierde una vida y se destapan sus vecinas con su número.

**Se gana cuando todas las bombas llevan `!` (seguro)** —las que hayas pisado también cuentan—,
sin ningún seguro en una casilla vacía y sin ninguna duda `?` pendiente. Destapar todo no basta:
hay que señalar las bombas.

Puntuación (ranking local, top 10 por nivel):

```
puntos = base(nivel) − segundos (solo niveles 3 y 4) − 100 × (intentos − 1) − 25 × dudas
```

## Niveles

| Nivel | Celdas | Minas | Cronómetro |
|---|---|---|---|
| 1 — Iniciación | 42 | 4 | No |
| 2 — Fácil | 137 | 14 | No |
| 3 — Medio | 347 | 49 | Sí |
| 4 — Difícil | 635 | 114 | Sí |

## Estructura

```
index.html            pantallas: inicio, juego y ranking
manifest.webmanifest  instalación como app
sw.js                 caché offline
css/estilos.css
js/
  main.js    arranque, pantallas y ventana       grid.js    geometría y pulsación
  board.js   reglas del juego (puro)             render.js  dibujo en canvas
  input.js   toques, doble toque, arrastre       ui.js      pantallas, HUD, paneles
  audio.js   música y conmutador                 score.js   ranking local
  config.js  constantes y textos                 storage.js localStorage protegido
data/
  levels.json  niveles generados: celdas con su centro, minas, cronómetro y ventana
assets/        tableros por nivel (WebP), fichas, iconos y música
```

El proyecto completo (fuentes, máscaras, herramientas y documentación) vive fuera de este
repositorio. Los tableros y sus centros se generan desde `resources/playzone.cfg` y las máscaras
con `tools/build_levels.py`; las fichas, iconos y audio, con `tools/build_assets.py`.

## Publicar cambios

Sube los ficheros y **cambia la versión del service worker** en `sw.js`
(`animaminas-v7` → `v8`, etc.); si no, quien ya tenga la app instalada seguirá viendo la
versión en caché. Pages redespliega solo en un minuto.

## Créditos

Gráficos y música originales del autor del proyecto. Licencia MIT, ver `LICENSE`.
