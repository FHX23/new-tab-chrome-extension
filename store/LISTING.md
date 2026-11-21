# Publicación en la Chrome Web Store

Todo lo que pide el panel de desarrollador (`chrome.google.com/webstore/devconsole`), listo para copiar.
El paquete se arma con `python tools/build_zip.py` → `dist/mi-nueva-pestana-<versión>.zip`.

---

## 1. Ficha de la tienda (Store listing)

**Categoría:** Productividad (Productivity) → Herramientas / Flujo de trabajo
**Idiomas:** español (es) e inglés (en). El nombre y la descripción corta salen de `_locales/`.

### Descripción detallada — Español
```
Convierte la nueva pestaña en tu propia pantalla de inicio, como la de un celular.

• Accesos directos ilimitados, repartidos en varias pantallas. Cambia de pantalla con las flechas, la rueda del mouse o los puntos.
• Tú decides cuántos espacios tiene cada pantalla (por ejemplo 3×3, o una fila de 3 y otra de 4) y dónde va cada icono.
• Iconos y widgets en hasta 9 tamaños (desde 1×1 hasta 4×3) y 7 formas (círculo, redondeado, cuadrado, hexágono, estrella, triángulo y corazón), con botones directos para agrandar (+) y achicar (−).
• Carpetas: suelta un icono sobre otro para agruparlos (con estilos panel centrado, burbuja o pantalla completa).
• Tu barra de marcadores, con carpetas y submenús, dentro de la nueva pestaña, y enlaces superiores con color propio e individual para cada enlace.
• Clic derecho para abrir en pestaña nueva, ventana o incógnito, cambiar tamaño, forma o moverlo de pantalla.
• Funciona con mouse, pantalla táctil y lápiz. Mantén presionado un icono para editar.
• Botón exprés «↶ Deshacer» en la barra de edición (además de Ctrl+Z), y copias automáticas diarias para no perder nada.
• Galería de 18 fondos de alta resolución (12 fotografías 2.5K de dominio público NASA/NPS/arte clásico + 6 fondos vectoriales 4K) y rotación automática mezclando fondos incluidos con tus propias fotos subidas.
• Widgets opcionales (abiertos en cuadrícula, filas a medida y lista): reloj, notas, tareas, calendario mensual, calculadora con historial interactivo y soporte de teclado, temporizador Pomodoro, reloj mundial, cuenta regresiva, progreso, hábitos, conversor, respiración, fotos y tarjetas opcionales de Google Drive (archivos recientes) y Google Calendar (próximas reuniones con botón «Unirse a la reunión»).

El buscador usa siempre el buscador predeterminado de tu Chrome.

Privacidad: tus primeros accesos se crean a partir de tus sitios más visitados y la barra muestra tus marcadores. Todo se usa y se guarda solo en tu computador. La extensión no envía datos a ningún servidor, no tiene anuncios ni analítica, y no carga nada desde internet.

Hecha a mano, sin librerías, para que abra al instante.
```

### Detailed description — English
```
Turn your new tab into your own home screen, like the one on your phone.

• Unlimited shortcuts across several screens. Switch screens with the arrows, the mouse wheel or the dots.
• You decide how many spaces each screen has (for example 3×3, or a row of 3 and a row of 4) and where each icon goes.
• Icons and widgets in up to 9 sizes (from 1×1 up to 4×3) and 7 shapes (circle, rounded, square, hexagon, star, triangle and heart), with direct buttons to enlarge (+) and shrink (−).
• Folders: drop one icon on another to group them (with centered panel, bubble or full-screen styles).
• Your bookmarks bar, with folders and submenus, inside the new tab, plus top-right links with individual custom colors per link.
• Right-click to open in a new tab, window or incognito, change size or shape, or move to another screen.
• Works with mouse, touchscreen and pen. Press and hold an icon to edit.
• Express “↶ Undo” button in the edit toolbar (plus Ctrl+Z), and automatic daily backups so you never lose anything.
• Built-in gallery of 18 high-resolution backgrounds (12 2.5K Public Domain NASA/NPS/classic art photos + 6 4K vector landscapes) plus automatic rotation mixing included backgrounds with your own uploaded photos.
• Optional widgets (open in grid, custom rows and list layouts): clock, notes, to-dos, monthly calendar, calculator with interactive history and keyboard support, Pomodoro timer, world clock, countdown, progress, habits, converter, breathing, photos, plus optional Google Drive (recent files) and Google Calendar (upcoming meetings with “Join meeting” button) cards.

The search box always uses your Chrome default search engine.

Privacy: your first shortcuts are created from your most visited sites, and the bar shows your bookmarks. Everything is used and stored only on your computer. The extension sends no data to any server, has no ads or analytics, and loads nothing from the internet.

Handmade, with no libraries, so it opens instantly.
```

### Imágenes
| Imagen | Tamaño | Notas |
|---|---|---|
| Ícono de la tienda | 128×128 | `icons/icon128.png` |
| Capturas (1 a 5) | **1280×800** (o 640×400) | Ver guía abajo |
| Mosaico promocional pequeño | 440×280 | Opcional pero recomendado: ícono + nombre sobre fondo oscuro |

**Guía para las capturas (importante para la revisión):**
- Usa el logo neutro («Inicio» / «Home») u otro texto propio. **Que no aparezca «Google» ni su logo.**
- No muestres datos personales: ni correos, ni nombres de pestañas privadas, ni marcadores personales.
- Sugerencias: 1) pantalla principal con fondo; 2) modo edición con un icono grande y una carpeta;
  3) menú de clic derecho; 4) Ajustes → Forma de los iconos; 5) widgets (reloj y tareas).
- En Chrome: ventana a 1280×800, F12 → modo dispositivo → «Capture screenshot».

---

## 2. Prácticas de privacidad (Privacy practices)

### Propósito único (Single purpose)
```
Replaces Chrome's new tab page with a customizable home screen of shortcuts: screens with configurable spaces, icon sizes and shapes, folders, the user's bookmarks bar and optional new-tab widgets (clock, notes, to-dos).
```

### Justificación de permisos
| Permiso | Justificación (para pegar) |
|---|---|
| `storage` | Saves the user's shortcuts, folders, screens, widgets and settings locally so the new tab page keeps its layout, and keeps local daily backups. |
| `favicon` | Shows each shortcut's site icon from Chrome's local favicon cache, without making network requests to the sites. |
| `search` | The search box on the new tab page sends queries to the user's default search engine through chrome.search, respecting the user's search settings. |
| `topSites` | On install, creates the user's first shortcuts from their most visited sites, and powers the "Add my most visited" button. The list is used only locally. |
| `bookmarks` | Displays the user's bookmarks bar (with folders) inside the new tab page and lets the user add bookmarks as shortcuts. Read-only: bookmarks are never modified. |
| `history` *(optional)* | Optional and off by default. Requested only if the user enables the optional Google Drive recent-files card, to list the latest Google Docs, Sheets, Slides, PDFs and Drive files opened in the browser locally without requiring login. |
| `Host permissions` (`calendar.google.com` — *optional*) | Optional and off by default. Requested only when the user connects their Google Calendar iCal (.ics) feed on the optional Calendar card so the browser can read upcoming meetings directly from Google Calendar. |

**¿Usa código remoto?** No. Todo el JavaScript va dentro del paquete; no se carga ni ejecuta código externo.

### Uso de datos (Data usage)
Marcar que la extensión **maneja**:
- [x] **Historial web (Web history):** la lista de sitios más visitados (`topSites`) y los marcadores, usados solo en el equipo para mostrar accesos y la barra.

No marcar el resto (información personal, salud, finanzas, autenticación, comunicaciones, ubicación, actividad del usuario, contenido de sitios web).

Certificar las tres casillas:
- [x] No vendo ni transfiero datos de usuarios a terceros, fuera de los casos de uso aprobados.
- [x] No uso ni transfiero datos de usuarios para fines no relacionados con el propósito único del elemento.
- [x] No uso ni transfiero datos de usuarios para determinar la solvencia crediticia ni para préstamos.

### URL de la política de privacidad
`https://github.com/FHX23/new-tab-chrome-extension/blob/main/PRIVACY.md`

⚠️ Solo funciona cuando el repositorio es **público**. Si quieres publicar en la tienda con el repo aún
privado, la política tiene que estar en otra URL pública (por ejemplo, un Gist público con el mismo
texto). `PRIVACY.md` ya incluye la declaración de **Uso limitado** que exige la tienda.

---

## 3. Antes de enviar a revisión
- [ ] `python tools/build_zip.py` y subir el `.zip` de `dist/`.
- [ ] Probar el `.zip`: descomprimirlo en una carpeta nueva → `chrome://extensions` → «Cargar descomprimida».
- [ ] Ficha completa en español e inglés, con capturas sin la marca Google.
- [ ] Prácticas de privacidad y URL de la política.
- [ ] Declaración de comerciante (trader) o no comerciante: para un proyecto gratuito y personal, «no comerciante».
- [ ] Verificación en dos pasos activa en la cuenta de Google del desarrollador.
