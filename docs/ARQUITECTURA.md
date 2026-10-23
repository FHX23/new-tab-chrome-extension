# Arquitectura y guía técnica

## 1. ¿Cómo se hace?

Chrome permite que una extensión **reemplace la página de Nueva pestaña** con una página HTML propia.
Se declara en `manifest.json`:

```json
"chrome_url_overrides": { "newtab": "newtab.html" }
```

Con eso, cada pestaña nueva abre `newtab.html` de la extensión. Esa página es HTML, CSS y JS normales,
así que podemos hacer *cualquier* diseño: imitar el de Google y quitarle lo que no queremos
(los botones "Crear imágenes" y "Modo IA", y el límite de 10 accesos).

> No es posible *modificar* la página real de Google (es interna de Chrome). Lo que hacemos es
> **reemplazarla** por una copia hecha por nosotros.

## 2. APIs de Chrome que se usan

| Necesidad | Solución | Permiso |
|---|---|---|
| Reemplazar la nueva pestaña | `chrome_url_overrides.newtab` | (ninguno) |
| Guardar accesos y ajustes | `chrome.storage.local` | `storage` |
| Fondo general (para pintarlo al instante) | `localStorage` como imagen comprimida | (ninguno) |
| Fondo propio de cada pantalla, copias automáticas | IndexedDB y `chrome.storage.local` | `storage` |
| Iconos de los sitios | `/_favicon/?pageUrl=…&size=64`: usa la caché de favicons de Chrome, sin internet | `favicon` |
| Buscar desde el cuadro | `chrome.search.query()`: usa el buscador por defecto del usuario | `search` |
| Traer tus sitios más visitados (al instalar y con un botón) | `chrome.topSites.get()` | `topSites` |
| Barra de marcadores dentro de la página | `chrome.bookmarks.getTree()` + eventos de cambios | `bookmarks` |
| Abrir en pestaña, ventana o incógnito (clic derecho) | `chrome.tabs.create()`, `chrome.windows.create()` | (ninguno) |
| Abrir páginas `chrome://…` | `chrome.tabs.update()` | (ninguno) |

Ningún permiso da acceso al contenido de las páginas que visitas. `topSites` solo entrega la lista
de tus sitios más visitados (la misma que usa Google en sus accesos) y `bookmarks` tus marcadores.

## 3. Arquitectura del código

```
manifest.json        configuración (Manifest V3), idiomas y permisos
_locales/es|en/      nombre y descripción de la extensión en cada idioma
icons/               íconos: icon.svg (48 y 128 px, colorido) e icon-small.svg (16 y 32 px, gris y discreto,
                     el que se ve en la pestaña); tools/make_icons.py genera los PNG
newtab.html          estructura: barra de marcadores, logo, buscador, pantallas, diálogos
css/newtab.css       estilos (variables CSS para tamaños, colores, formas y tema de paneles)
js/boot.js           pinta color e imagen de fondo antes del primer frame
js/i18n.js           todos los textos: clave → [español, inglés]
js/store.js          guardar/cargar (localStorage + chrome.storage.local + IndexedDB), copias automáticas
js/core.js           utilidades, colocación libre, dibujo, deshacer, íconos con inicial
js/widgets.js        reloj, notas y tareas
js/interact.js       arrastrar (mouse/táctil/lápiz), menús de clic derecho, barra de marcadores, navegación
js/panels.js         editor, carpeta, ajustes de pantalla, ajustes generales, buscador, bienvenida
js/main.js           arranque y migraciones de versiones anteriores
```

Son scripts clásicos (no módulos) que comparten el ámbito global y se cargan en ese orden al final
del `<body>`. Así se ejecutan antes del primer pintado.

### Modelo de datos
```js
{
  v: 4,
  settings: { layout: 'grid'|'rows'|'list', cols, rows, rowPattern: '3,4', shape, ...colores, xWidgets, xPages, xSearch },
  pages: [                                   // cada "pantalla"
    { id, name?, bg?, cols?, rows?, pattern?, items: [
      { id, type: 'link',   x, y, w, h, title, url, icon?, glyph?, shape? },
      { id, type: 'folder', x, y, w, h, title, items: [links] },
      { id, type: 'widget', x, y, w, h, kind: 'clock'|'notes'|'todo', text?, todos? },
    ]}
  ]
}
```

### Colocación libre (como Android)
Cada icono guarda su celda (`x`, `y`). Cada pantalla tiene espacios fijos: columnas × filas en
cuadrícula y lista, o el patrón de filas (ej. `3,4`). Los valores van en la propia pantalla, y si no
tiene, usa los de Ajustes.
- `place()` respeta la posición de cada icono. Los que chocan, o no tienen lugar, van al primer hueco libre.
- `reflow()` manda lo que no cabe a la pantalla siguiente y la crea si hace falta.
- `fitPages()` achica celdas e iconos lo justo para que la pantalla entera quepa en la ventana: nunca hay scroll.
- Al soltar sobre otro icono: en el **centro** se crea una carpeta; en el **borde** se intercambian.

### Disposiciones
- **Cuadrícula** (tipo celular): tamaños 1×1, 2×1, 1×2 y 2×2, y posición libre.
- **Filas a medida**: escribes `3,4` y queda una fila de 3 y otra de 4.
- **Lista**: icono y nombre, se llena por columnas.

## 4. Optimización y librerías

**No usa ninguna librería ni framework.** Todo es HTML, CSS y JavaScript escritos a mano (unos 120 KB
sin comprimir, incluidos los textos en dos idiomas), y nada se descarga de internet. Un dibujo
completo de la página tarda **menos de 1 ms**. Un framework agregaría más código que cargar en cada
pestaña nueva, sin aportar nada que aquí haga falta.

Qué se hizo para que cargue al instante:
- **Lectura síncrona**: el estado se guarda también en `localStorage`, que se lee sin esperar.
  Los scripts son clásicos y van al final del `<body>`, así que la página queda **completa en el
  primer frame**. Antes se esperaba a `chrome.storage`, que es asíncrono, y por eso se notaba lento.
- **Fondo instantáneo**: `boot.js` aplica el color y la imagen en el `<head>`, antes de pintar.
- **Imagen de fondo optimizada**: al subirla se reduce al tamaño de tu pantalla y se comprime en
  WebP. Se decodifica mucho más rápido que una foto original de 4000 px.
- Se quitó `background-attachment: fixed` y los `backdrop-filter` (blur), que obligan a redibujar.
- `content-visibility: auto`: Chrome no dibuja las pantallas que no se ven.
- Los favicons de pantallas ocultas se cargan con `loading="lazy"`.
- Al mover un control de ajustes que solo cambia colores o tamaños se actualizan **variables CSS**,
  sin reconstruir los iconos.
- Los marcadores se guardan en caché para pintarlos al instante. Después se refrescan en segundo plano.
- Favicons desde la caché local de Chrome (`_favicon`), sin peticiones de red.
- Los globos genéricos se detectan comparando píxeles una sola vez. El resultado queda en caché un día.
- Un solo temporizador para todos los relojes: se despierta una vez por minuto y se pausa si la pestaña no se ve.
- Los extras apagados no cuestan nada: no dibujan ni registran nada.

## 4b. Políticas de la Chrome Web Store
Revisado contra las políticas vigentes (octubre de 2026):
- **Nueva pestaña con buscador:** debe respetar el buscador predeterminado del usuario mediante
  `chrome.search`. Se pueden ofrecer otros buscadores, pero la opción por defecto tiene que ser la de
  Chrome. Por eso, en el extra «Buscador avanzado» el otro buscador vale **solo para una búsqueda**
  (menú ⌄ o atajos como `yt gatos`) y después vuelve al de Chrome. Desde la v5 ya no existe un
  selector permanente.
- **Marcas:** valores de fábrica neutros («Inicio») y logo a colores con paleta propia, no la de Google.
  En la ficha y en las capturas no debe aparecer «Google».
- **Datos de usuario:** los sitios más visitados cuentan como «historial web», aunque se procesen solo
  en el equipo. Por eso se necesitan la política de privacidad (`PRIVACY.md`, con la declaración de
  Uso limitado) y la declaración en el panel. La bienvenida y Ajustes → Datos lo explican dentro de la extensión.
- **Permisos mínimos, sin código remoto ni ofuscación, propósito único (nueva pestaña).**
- Textos de la ficha, justificación de permisos y lista de verificación: `store/LISTING.md`.
  El paquete se arma con `python tools/build_zip.py`, que además revisa los límites de largo.

## 5. Limitaciones conocidas (de Chrome, no del código)
0. **Los 10 accesos de la página de Google no se pueden leer.** Chrome no da ninguna API para eso.
   La extensión parte con tus *sitios más visitados* (`chrome.topSites`), que no son lo mismo que
   los accesos que tú fijaste en Google.
1. **El cursor queda en la barra de direcciones** y no en nuestro buscador: Chrome lo fuerza en
   las nuevas pestañas de extensiones. Escribir directo en la barra sigue funcionando igual.
2. Al instalarla, Chrome pregunta **"¿Es esta la página que esperabas?"**. Hay que elegir *Conservar*.
3. No hay *doodles* de Google, ni micrófono, ni Google Lens (son exclusivos de la página interna).
4. `_favicon` solo tiene iconos de sitios que ya visitaste. Para los demás se muestra la inicial
   con un color. También se puede subir un icono o usar un emoji.
5. Si la extensión se carga "descomprimida", Chrome puede mostrar un aviso de modo desarrollador al iniciar.

## 6. Instalación (modo desarrollador)
1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** y elige esta carpeta (`google chrome extension`).
4. Abre una pestaña nueva y elige *Conservar cambios* si Chrome pregunta.

Después de editar el código, pulsa el botón ↻ de la extensión en `chrome://extensions`.

## 7. Uso
- **Lápiz** (abajo a la derecha) o **mantener presionado un icono**: entra al modo edición.
- En modo edición (funciona con mouse, pantalla táctil y lápiz):
  - **Arrastra** un icono a cualquier hueco. Un recuadro muestra dónde caerá: azul si cabe, rojo si no.
  - Suéltalo **en el centro de otro** para crear una carpeta, o **en su borde** para intercambiarlos.
  - Suéltalo **sobre un punto** de abajo para mandarlo a esa pantalla.
  - Mantenlo **en un borde** para cambiar de pantalla. Pasado el borde de la última, se crea una nueva.
  - Arrastra un icono **fuera de una carpeta abierta** para sacarlo.
  - Arrastra un **marcador** de la barra a un hueco para crear un acceso.
- **Clic derecho**:
  - En un icono: abrir en pestaña, ventana o incógnito; editar, tamaño, forma, mover y eliminar.
  - En un marcador: abrirlo o agregarlo a la pantalla.
  - En un espacio vacío: agregar, ajustes de la pantalla y deshacer.
- Arrastrar un enlace desde otra ventana a la página crea un acceso.
- **Deshacer**: botón en el aviso o `Ctrl+Z`. Además se guarda una **copia automática** al día (las últimas 7).
- **Ajustes** por pestañas:
  - **Iconos:** disposición, espacios, tamaños y forma.
  - **Botones:** flechas, puntos y lápiz.
  - **Fondo:** colores, imagen y tema claro u oscuro de los paneles.
  - **Página:** logo, buscador, enlaces de arriba y barra de marcadores.
  - **Extras:** widgets, nombre y fondo por pantalla, y buscador avanzado.
  - **Datos:** más visitados, respaldos, copias automáticas y restablecer.

## 8. Ideas para siguientes versiones
- Sugerencias de búsqueda mientras escribes (necesita permiso de host para `suggestqueries.google.com`).
- Sincronizar entre computadores con `chrome.storage.sync` (límite de 100 KB, sin iconos subidos).
- Temas predefinidos con un clic.
- Moverse entre iconos con el teclado.
- Versión para Firefox (no tiene la API de favicons; habría que adaptarla).
