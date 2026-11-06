# Jose's World

Portafolio personal de José Miguel Féliz con estética de mundo de bloques, en primera persona y controlado por scroll.
**Episodio 1 (MVP):** pantalla de carga → caída desde el cielo → "Jose's World" → la casa (Sobre mí) → el túnel/dungeon → el portal → viaje en vagoneta por el Nether con los cursos en letreros que caen del techo → tarjeta final con contacto.

Todo lo visual es original y generado por código en tiempo real (texturas pixel-art procedurales, modelos voxel, sonido sintetizado). No se usa ningún asset del juego.

## Stack

- [Vite](https://vitejs.dev) + TypeScript
- [Three.js](https://threejs.org) r170 (WebGL2: el mundo usa *texture arrays*)
- [postprocessing](https://github.com/pmndrs/postprocessing): bloom, god rays, viñeta, grano, tone mapping ACES
- [GSAP](https://gsap.com) (intro) + [Lenis](https://lenis.darkroom.engineering) (scroll suave)
- WebAudio API para todo el sonido (sin archivos)

## Correr en local

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # genera dist/
npm run preview   # sirve dist/
```

Parámetros útiles en la URL: `?q=low|medium|high` fuerza la calidad, `?skip` salta la caída inicial.

## Editar el contenido

Casi todo el texto vive en **`src/content.ts`** (inglés y español):

- `COURSES` → los letreros del Nether (nombre corto del letrero, título, temas).
- `ABOUT` → los tres "beats" de la casa (mapa, librero, escritorio).
- `PROJECTS`, `CONTACT`, `UI` → placeholders para los próximos episodios, enlaces y textos de interfaz.

El orden y los rangos de scroll de cada capítulo están en `src/director/timeline.ts` (también la ruta de la cámara: `OVERWORLD_KEYS`).

## Mapa del código

```
src/
  app.ts                 arranque: loader → escenas → intro → director
  content.ts             TODO el contenido (EN/ES)
  engine/
    textures.ts          tiles pixel-art procedurales → DataArrayTexture
    blocks.ts            registro de bloques (tiles por cara, luz emitida)
    world.ts             grid de voxels + propagación de luz (bloques y cielo)
    mesher.ts            caras visibles, AO por vértice, luz horneada; cajas de detalle
    voxelMaterial.ts     MeshStandardMaterial parchado (texture array, AO, glow, sway)
    Experience.ts        renderer, cámara, composer, niveles de calidad
  world/
    overworld.ts         generación del mundo: terreno, lago, árboles, casa, dungeon, portal, título voxel
    OverworldScene.ts    escena: cielo, sol, nubes, agua, luces, puerta, mapa de RD, partículas
    nether.ts / NetherScene.ts   caverna, lava, rieles, vagoneta, letreros que caen
    sky.ts water.ts lava.ts portal.ts glow.ts drmap.ts
  director/
    timeline.ts          rangos de scroll + keyframes de cámara
    Director.ts          scroll → cámara, cambio de escena, animaciones, UI
    Intro.ts             la caída desde el cielo
  ui/
    Loader.ts Hud.ts Overlays.ts Audio.ts i18n.ts Fallback.ts
```

## Deploy

El repo incluye un workflow de GitHub Pages (`.github/workflows/deploy.yml`). Activa Pages en *Settings → Pages → Source: GitHub Actions* y cada push a `main` publica el sitio. El build usa `base: './'`, así que funciona en cualquier subcarpeta o dominio.

## Próximos episodios (plan)

1. **Taller** (Proyectos): mesas de crafteo, cada proyecto se "craftea" con su stack.
2. **Biblioteca** (Experiencia): pasantía en la Superintendencia de Bancos, grader/TA, DSA, Hackathon Club.
3. **Sala de encantamientos** (Skills): niveles de encantamiento por tecnología.
4. **Portal** (Contacto): enlaces, CV.
5. Easter eggs, modo "clásico" 2D opcional, modelos importados de Blockbench/MagicaVoxel.
