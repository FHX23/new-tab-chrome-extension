# Arquitectura y guía técnica

## 1. ¿Cómo se hace?

Chrome permite que una extensión **reemplace la página de Nueva pestaña** con una página HTML propia.
Se declara en `manifest.json`:

```json
"chrome_url_overrides": { "newtab": "newtab.html" }
```

Con eso, cada pestaña nueva abre `newtab.html` de la extensión. Esa página es HTML, CSS y JS normales,
así que podemos construir nuestra propia pantalla de inicio con múltiples pantallas, widgets, fondos
de alta resolución y colocación libre sin límites artificiales.

> No es posible *modificar* la página real de Google (es interna de Chrome). Lo que hacemos es
> **reemplazarla** por una implementación propia hecha a mano.

## 2. APIs de Chrome que se usan

| Necesidad | Solución | Permiso |
|---|---|---|
| Reemplazar la nueva pestaña | `chrome_url_overrides.newtab` | (ninguno) |
| Guardar accesos y ajustes | `chrome.storage.local` | `storage` |
| Fondo general (para pintarlo al instante) | `localStorage` como imagen comprimida o ruta de galería `bg/` | (ninguno) |
| Fondos subidos (`bgPool`), fondo por pantalla y fotos de widgets | IndexedDB y `chrome.storage.local` | `storage` |
| Iconos de los sitios | `/_favicon/?pageUrl=…&size=64`: usa la caché de favicons de Chrome, sin internet | `favicon` |
| Buscar desde el cuadro | `chrome.search.query()`: usa el buscador por defecto del usuario | `search` |
| Traer tus sitios más visitados (al instalar y con un botón) | `chrome.topSites.get()` | `topSites` |
| Barra de marcadores dentro de la página | `chrome.bookmarks.getTree()` + eventos de cambios | `bookmarks` |
| Tarjeta opcional de Google Drive (archivos recientes sin OAuth) | `chrome.history.search()` filtrando documentos locales de Drive/Docs/Sheets/Slides | `history` *(opcional)* |
| Tarjeta opcional de Google Calendar (próximas reuniones) | Lectura local de feed `.ics`, sesión o archivo exportado `.ics`/`.zip` | `https://calendar.google.com/*` *(opcional)* |
| Abrir en pestaña, ventana o incógnito (clic derecho) | `chrome.tabs.create()`, `chrome.windows.create()` | (ninguno) |
| Abrir páginas `chrome://…` | `chrome.tabs.update()` | (ninguno) |

Ningún permiso envía información fuera del computador. Los permisos `history` y `calendar.google.com` son **opcionales** (`optional_permissions` / `optional_host_permissions`), están apagados de fábrica y solo se solicitan si el usuario activa las tarjetas de Google Drive o Google Calendar.

## 3. Arquitectura del código

```text
manifest.json        configuración (Manifest V3), idiomas y permisos obligatorios/opcionales
_locales/es|en/      nombre y descripción de la extensión en cada idioma
icons/               íconos: icon.svg (48 y 128 px, colorido) e icon-small.svg (16 y 32 px, gris y discreto,
                     el que se ve en la pestaña); tools/make_icons.py genera los PNG
bg/                  galería integrada de 18 fondos (12 fotos QHD 2.5K de dominio público + 6 paisajes SVG 4K)
newtab.html          estructura: barra de marcadores, logo, buscador, pantallas, barra de edición, diálogos
css/newtab.css       estilos (variables CSS, unidades de contenedor cqw/cqh, formas, widgets y temas)
js/boot.js           pinta color, imagen de fondo y rotación automática antes del primer frame
js/i18n.js           todos los textos bilingües: clave → [español, inglés]
js/store.js          guardar/cargar (localStorage + chrome.storage.local + IndexedDB), bgPool y copias automáticas
js/core.js           utilidades, colocación libre hasta 4×3, controles +/−, dibujo, deshacer, íconos con inicial
js/widgets.js        15 widgets (reloj, notas, tareas, calculadora profunda, Drive, Calendar, Pomodoro, etc.)
js/interact.js       arrastrar (mouse/táctil/lápiz), menús de clic derecho, barra de marcadores, navegación
js/panels.js         editor, carpetas (3 estilos), configuración de widgets, ajustes por pestañas, bienvenida
js/main.js           arranque, tareas diferidas (requestIdleCallback) y migraciones (v1 → v7)
```

Son scripts clásicos (no módulos) que comparten el ámbito global y se cargan en ese orden al final
del `<body>`. Así se ejecutan antes del primer pintado.

### Modelo de datos (`v: 7`)
```js
{
  v: 7,
  settings: {
    layout: 'grid'|'rows'|'list', cols, rows, rowPattern: '3,4', shape, folderStyle: 'modal'|'popover'|'page',
    bgPreset, bgRotate: 'off'|'tab'|'5'|'15'|'30'|'60', bgRotatePool: [...],
    ...colores, topLinks: [{ title, url, color? }], xWidgets, xPages, xSearch
  },
  pages: [                                   // cada "pantalla"
    { id, name?, bg?, layout?, cols?, rows?, pattern?, items: [
      { id, type: 'link',   x, y, w, h, title, url, icon?, glyph?, shape? },
      { id, type: 'folder', x, y, w, h, title, items: [links] },
      { id, type: 'widget', x, y, w, h, kind: 'clock'|'notes'|'todo'|'calc'|'drive'|'gcal'|'cal'|'timer'|'worldclock'|'countdown'|'progress'|'photos'|'habits'|'converter'|'breathe', cfg?: {...} }
    ]}
  ]
}
```

### Colocación libre y tamaños hasta `4×3`
Cada icono o widget guarda su celda (`x`, `y`) y su dimensión (`w`, `h`, desde `1×1` hasta `4×3`).
Cada pantalla tiene espacios fijos: columnas × filas en cuadrícula y lista, o el patrón de filas (ej. `3,4`).
- `place()` respeta la posición de cada elemento. Los que chocan o no tienen lugar van al primer hueco libre.
- `reflow()` manda lo que no cabe a la pantalla siguiente y la crea si hace falta.
- `fitPages()` calcula dinámicamente el tamaño de celdas e iconos para que la pantalla entera quepa siempre en la ventana sin scroll, incluso en pantallas compactas (`1280×720`) o en filas a medida con widgets grandes.
- Controles independientes de **Agrandar (`+`)** y **Achicar (`−`)** aplican saltos proporcionados según el tipo de widget o icono.
- Al soltar sobre otro icono: en el **centro** se crea una carpeta; en el **borde** se intercambian.

### Disposiciones
- **Cuadrícula** (tipo celular): 9 tamaños (`1×1`, `2×1`, `1×2`, `2×2`, `3×2`, `2×3`, `3×3`, `4×2` y `4×3`) y posición libre.
- **Filas a medida**: escribes `3,4` y queda una fila de 3 y otra de 4, admitiendo también widgets abiertos.
- **Lista**: icono y nombre por columnas, con soporte para widgets abiertos integrados.

## 4. Optimización y librerías

**No usa ninguna librería ni framework.** Todo es HTML, CSS y JavaScript escritos a mano, y nada se
descarga de internet al abrir una pestaña. Un dibujo completo de la página tarda **menos de 1 ms**.

Qué se hizo para que cargue al instante:
- **Lectura síncrona**: el estado se guarda también en `localStorage`, que se lee sin esperar.
  Los scripts son clásicos y van al final del `<body>`, así que la página queda **completa en el
  primer frame**.
- **Fondo instantáneo**: `boot.js` aplica el color, la imagen de la galería `bg/` o la miniatura en caché en el `<head>`, antes de pintar.
- **Imágenes de fondo optimizadas**: la galería integrada usa WebP QHD 2.5K y SVG 4K; al subir fotos propias se redimensionan a la pantalla y se comprimen en WebP dentro de `IndexedDB` (`bgPool`).
- **Arrastre sincronizado**: el movimiento de iconos usa `requestAnimationFrame` para mantener 60/120 fps constantes.
- **Tareas en segundo plano diferidas**: la carga de marcadores, copias automáticas diarias y limpieza de fotos huérfanas en IndexedDB se postergan con `requestIdleCallback`.
- `content-visibility: auto`: Chrome no dibuja las pantallas que no se ven.
- Los favicons de pantallas ocultas se cargan con `loading="lazy"` desde la caché local (`_favicon`).

## 4b. Políticas de la Chrome Web Store
Revisado contra las políticas vigentes de Manifest V3:
- **Nueva pestaña con buscador:** respeta siempre el buscador predeterminado del usuario mediante `chrome.search`. En el extra «Buscador avanzado», elegir otro buscador aplica **solo para esa búsqueda puntual** y luego vuelve al predeterminado de Chrome.
- **Marcas:** valores de fábrica neutros («Inicio») y logo a colores con paleta propia. En la ficha y en las capturas no debe aparecer la marca «Google».
- **Datos de usuario y permisos opcionales:** todo se procesa localmente. `PRIVACY.md` incluye la declaración de **Uso limitado** exigida por la tienda, y `store/LISTING.md` contiene las justificaciones listas para copiar y pegar.
- El paquete de distribución se genera con `python tools/build_zip.py` → `dist/mi-nueva-pestana-0.5.0.zip`.

## 5. Limitaciones conocidas (de Chrome, no del código)
0. **Los 10 accesos internos de la página de Google no se pueden leer.** Chrome no ofrece ninguna API para eso. La extensión parte con tus *sitios más visitados* (`chrome.topSites`).
1. **El cursor queda en la barra de direcciones** al abrir una pestaña nueva: Chrome lo fuerza por diseño en todas las extensiones de nueva pestaña.
2. Al instalarla por primera vez, Chrome pregunta **"¿Es esta la página que esperabas?"**. Hay que elegir *Conservar*.
3. `_favicon` solo tiene iconos de sitios que ya visitaste en ese perfil. Para los demás se genera un ícono con inicial y color, o puedes elegir un emoji o subir una imagen.

## 6. Instalación (desde el ZIP o el código)
1. Descarga el paquete `mi-nueva-pestana-0.5.0.zip` desde **GitHub Releases** (o clona este repositorio).
2. Abre `chrome://extensions` y activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige la carpeta descomprimida.
4. Abre una pestaña nueva y elige *Conservar* si Chrome pregunta.

## 7. Uso y pestañas de Ajustes
- **Lápiz** (abajo a la derecha) o **mantener presionado un icono**: entra al modo edición.
- **Botón «↶ Deshacer»** en la barra superior de edición o `Ctrl+Z` para revertir cualquier cambio.
- **Botones `+` y `−`** sobre cada icono o widget en modo edición para agrandar o achicar su tamaño hasta `4×3`.
- **Ajustes** organizados por pestañas:
  - **Iconos:** disposición (cuadrícula, filas o lista), espacios, tamaños, forma y estilo de carpetas.
  - **Fondo:** galería de 9 fondos QHD/4K incluidos, subida múltiple de fotos propias, rotación automática y colores/transparencias.
  - **Página:** logo, buscador, enlaces superiores (con color individual por enlace) y barra de marcadores.
  - **Botones:** flechas laterales (con altura interactiva configurable), puntos inferiores y botón de editar.
  - **Extras:** 13 widgets generales, nombre y fondo por pantalla, y buscador avanzado con atajos.
  - **Drive y Calendar:** activación y configuración local de las tarjetas de Google Drive y Google Calendar.
  - **Datos:** agregar más visitados, exportar/importar respaldo `.json`, copias automáticas diarias y restablecer.
