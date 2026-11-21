<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Mi Nueva Pestaña">
</p>

<h1 align="center">Mi Nueva Pestaña · My New Tab</h1>

<p align="center">
  Una nueva pestaña para Chrome que funciona como la pantalla de inicio de tu celular.<br>
  <em>A Chrome new tab that works like your phone's home screen.</em>
</p>

<p align="center">
  <a href="https://mi-nueva-pestana.vercel.app"><img alt="Sitio Web Oficial" src="https://img.shields.io/badge/🌐%20Sitio%20Web-mi--nueva--pestana.vercel.app-93f1f7?style=for-the-badge&labelColor=000000"></a>
  <a href="https://github.com/FHX23/new-tab-chrome-extension/releases/latest/download/mi-nueva-pestana-0.5.0.zip"><img alt="Descargar v0.5.0 (.zip)" src="https://img.shields.io/badge/⬇%20Descargar-v0.5.0%20(.zip)-2ea44f?style=for-the-badge"></a>
</p>

<p align="center">
  <img alt="Versión 0.5.0" src="https://img.shields.io/badge/versión-0.5.0-orange">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4c8bf5">
  <img alt="Sin librerías" src="https://img.shields.io/badge/librerías-0-2ea44f">
  <img alt="100% Local" src="https://img.shields.io/badge/privacidad-100%25%20local-0d9488">
  <img alt="Licencia GPL-3.0" src="https://img.shields.io/badge/licencia-GPL--3.0-blue">
</p>

[Sitio Web](https://mi-nueva-pestana.vercel.app) · [Español](#español) · [English](#english) · [Descargar / Download](https://github.com/FHX23/new-tab-chrome-extension/releases/latest)

---

## Español

### Qué hace
- **Accesos ilimitados en varias pantallas**, con flechas laterales (de altura configurable), rueda del mouse o puntos inferiores para moverte.
- **Cada pantalla tiene los espacios que tú eliges** (*Cuadrícula* como `4×3`, *Filas a medida* como `3,4` o *Lista*) y **sin scroll**.
- **Colocación libre, como en Android:** arrastras un icono o widget a cualquier hueco; si lo sueltas en el centro de otro icono se crea una **carpeta**, y en el borde se intercambian.
- **9 tamaños y 7 formas:** desde `1×1` hasta `4×3` con botones directos para **agrandar (`+`)** y **achicar (`−`)**; formas en círculo, redondeado, cuadrado, hexágono, estrella, triángulo y corazón.
- **3 estilos de carpetas:** panel centrado (estilo modal), burbuja contextual pegada a la carpeta o vista a pantalla completa.
- **Galería de 18 fondos de alta resolución y rotación automática:** incluye 12 fotografías QHD 2.5K de dominio público (NASA James Webb, ISS, Parques Nacionales y arte clásico de Hokusai) y 6 paisajes vectoriales 4K (`bg/`), además de subida múltiple de tus propias fotos y rotación automática al abrir una pestaña o cada ciertos minutos.
- **15 widgets opcionales** (abiertos y redimensionables en cuadrícula, filas y lista):
  - **Productividad y herramientas:** Reloj (digital, analógico, minimalista o en palabras), Notas rápidas (con contador y copiado en 1 clic), Lista de tareas, Calendario mensual, Temporizador Pomodoro, Reloj mundial con buscador de ciudades, Cuenta regresiva, Barra de progreso temporal, Registro semanal de hábitos, Conversor de unidades, Álbum de fotos y Ejercicio de respiración guiada.
  - **Calculadora profunda:** historial interactivo clicable, botones `AC`, `⌫` y `Ans`, precisión decimal corregida y soporte completo de teclado físico.
  - **Google Drive y Google Calendar (100% locales, sin OAuth):** tarjeta de archivos recientes de Drive (Docs, Sheets, Slides, Forms y PDFs abiertos en tu navegador, con vista ampliada `⤢`) y tarjeta de próximas reuniones de Calendar (vía enlace iCal `.ics`, sesión o archivo exportado, con indicador *«En curso / En X min»*, botón directo **«Unirse a la reunión»** para Meet/Zoom/Teams y creador de reuniones rápidas).
- **Tu barra de marcadores** dentro de la página, con carpetas y submenús, más enlaces rápidos arriba a la derecha con **color individual por enlace**.
- **Clic derecho** en iconos, marcadores y espacios vacíos: abrir en pestaña, ventana o incógnito; editar; redimensionar; cambiar forma; mover de pantalla…
- **Mouse, pantalla táctil y lápiz.** Mantén presionado un icono para entrar al modo edición.
- **Deshacer exprés:** botón directo **«↶ Deshacer»** en la barra de edición, atajo `Ctrl+Z` y **copias automáticas diarias** (las últimas 7) además de exportación/importación en `.json`.
- **Español e inglés**, según el idioma de Chrome.

### Cómo instalarla (en 30 segundos)
1. **[Haz clic aquí para descargar `mi-nueva-pestana-0.5.0.zip`](https://github.com/FHX23/new-tab-chrome-extension/releases/latest/download/mi-nueva-pestana-0.5.0.zip)** y descomprímelo en una carpeta fija de tu computador (por ejemplo, en `Documentos\MiNuevaPestana`).
2. En Chrome, escribe `chrome://extensions` en la barra de direcciones y activa el interruptor **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** (*Load unpacked*) y selecciona la carpeta que descomprimiste.
4. Abre una pestaña nueva. Si Chrome pregunta si es la página que esperabas, elige **Conservar**.

### Privacidad
Todo se procesa y se guarda **exclusivamente en tu computador** (`localStorage`, `chrome.storage.local` e `IndexedDB`). La extensión no tiene servidores propios, no envía telemetría ni analítica, no contiene anuncios y no requiere crear cuentas. Los permisos adicionales (`history` para Drive y `calendar.google.com` para Calendar) son **opcionales** y vienen apagados de fábrica. Detalle completo en [PRIVACY.md](PRIVACY.md).

### Para desarrolladores
- **HTML, CSS y JavaScript escritos a mano, sin librerías ni proceso de compilación.** Editas, pulsas ↻ en `chrome://extensions`, y listo.
- La arquitectura, el modelo de datos y las decisiones de rendimiento están en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
- `python tools/build_zip.py` arma el paquete limpio de distribución en `dist/mi-nueva-pestana-<versión>.zip`.
- `python tools/make_icons.py` regenera los íconos desde `icons/icon.svg` (colorido) e `icons/icon-small.svg` (monocromático discreto para la pestaña).
- Los textos bilingües viven en `js/i18n.js` (`clave: [español, inglés]`).

```text
manifest.json · newtab.html · css/ · js/ · icons/ · bg/ · _locales/   la extensión
docs/      documentación técnica y arquitectura
store/     textos y ficha para la Chrome Web Store
tools/     scripts de íconos y empaquetado (.zip)
```

---

## English

### What it does
- **Unlimited shortcuts across several screens**, with side arrows, mouse wheel or bottom dots to move around.
- **Each screen has the spaces you choose** (*Grid* like `4×3`, *Custom rows* like `3,4` or *List*) and **no scrolling**.
- **Free placement, Android style:** drag an icon or widget to any empty spot; drop it on another icon's center to make a **folder**, or on its edge to swap them.
- **9 sizes and 7 shapes:** from `1×1` up to `4×3` with direct **enlarge (`+`)** and **shrink (`−`)** buttons; circle, rounded, square, hexagon, star, triangle and heart shapes.
- **3 folder opening styles:** centered modal panel, contextual bubble next to the folder, or full-screen view.
- **Built-in gallery of 18 high-resolution backgrounds & auto-rotation:** 12 Public Domain QHD 2.5K photographs (NASA James Webb, ISS, U.S. National Park Service & classic Hokusai art) + 6 original 4K vector landscapes (`bg/`), multi-photo local uploads and automatic rotation on every new tab or by minute intervals.
- **15 optional widgets** (open and resizable in grid, custom rows and list layouts):
  - **Productivity & utilities:** Clock (digital, analog, minimalist or in words), Quick Notes (with character count and 1-click copy), To-do list, Monthly Calendar, Pomodoro Timer, World Clock with city search, Countdown, Time Progress bar, Weekly Habit tracker, Unit Converter, Photo Album and Guided Breathing.
  - **Deep Calculator:** clickable interactive history tape, `AC`, `⌫` and `Ans` buttons, floating-point precision fix and full physical keyboard support.
  - **Google Drive & Google Calendar cards (100% local, no OAuth):** recent Drive files card (Docs, Sheets, Slides, Forms and PDFs opened in your browser, with expanded popup view `⤢`) and upcoming Calendar meetings card (via `.ics` iCal link, browser session or exported file, with *"In progress / In X min"* badges, direct **"Join meeting"** button for Meet/Zoom/Teams and quick-meeting creator).
- **Your bookmarks bar** inside the page, with folders and submenus, plus customizable top-right links with **individual color pickers per link**.
- **Right-click** icons, bookmarks and empty spots: open in a tab, window or incognito; edit; resize; reshape; move across screens…
- **Mouse, touchscreen and pen.** Press and hold an icon to enter edit mode.
- **Express Undo:** direct **“↶ Undo”** button in the edit toolbar, `Ctrl+Z` shortcut, and **automatic daily backups** (last 7 days) plus `.json` export/import.
- **Spanish and English**, following Chrome's language.

### How to install (in 30 seconds)
1. **[Click here to download `mi-nueva-pestana-0.5.0.zip`](https://github.com/FHX23/new-tab-chrome-extension/releases/latest/download/mi-nueva-pestana-0.5.0.zip)** and unzip it into a permanent folder on your computer (e.g. `Documents\MyNewTab`).
2. Open `chrome://extensions` in Chrome and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder.
4. Open a new tab. If Chrome asks whether this is the page you expected, choose **Keep it**.

### Privacy
Everything is processed and stored **exclusively on your computer** (`localStorage`, `chrome.storage.local` and `IndexedDB`). The extension has no external servers, sends no telemetry or analytics, has no ads and requires no accounts. Extra permissions (`history` for Drive and `calendar.google.com` for Calendar) are **optional** and off by default. Full details in [PRIVACY.md](PRIVACY.md).

### For developers
- **Handwritten HTML, CSS and JavaScript, with no libraries and no build step.** Edit, click ↻ in `chrome://extensions`, done.
- Architecture, data model and performance notes (in Spanish): [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
- `python tools/build_zip.py` builds the clean distribution package in `dist/mi-nueva-pestana-<version>.zip`.
- `python tools/make_icons.py` regenerates the icons from `icons/icon.svg` (colorful) and `icons/icon-small.svg` (subtle monochrome tab icon).
- UI strings live in `js/i18n.js` (`key: [Spanish, English]`).

---

## Licencia · License

Copyright © 2026 FHX23

Este programa es software libre: puedes redistribuirlo y modificarlo bajo los términos de la
**Licencia Pública General de GNU, versión 3** ([LICENSE](LICENSE)). Las versiones modificadas que
distribuyas también deben publicarse con su código bajo la misma licencia.

*This program is free software: you can redistribute it and/or modify it under the terms of the
**GNU General Public License v3.0** ([LICENSE](LICENSE)). Modified versions you distribute must also be
released with their source code under the same license.*
