# Cambios · Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones 0.x = preliminares.

## [1.0.0] – 2026-11-26
### Agregado
- **Ajustes rediseñados con barra lateral nativa (`#settingsDlg`):** nueva interfaz de 2 columnas con navegación vertical por grupos (*Apariencia*, *Control e integraciones*, *Datos* y *Apoyar*), soporte de teclado (`↑`/`↓`), encabezados limpios, filas con interruptores nativos en CSS puro y separación clara de zona de peligro.
- **4 estilos rápidos en 1 clic con vuelta atrás automática:** *Aurora*, *Minimalista*, *Enfoque* y *Dock inferior* disponibles en la bienvenida y en *Ajustes → Fondo*; al probar estilos se guarda automáticamente tu configuración previa para volver en 1 clic (`↩ Volver a mi estilo anterior`).
- **Posición vertical (`gridY`, 0–100 %) y espaciado fino (`gapX`/`gapY`, 0–40 px):** permite situar tus iconos arriba, al centro o en la parte inferior (global o por pantalla individual), con vista previa semitransparente en vivo al ajustar y bandeja translúcida opcional estilo dock (`dockBar`).
- **Apariencia individual por elemento:** color propio, transparencia y efecto vidrio esmerilado (`glass`) configurables de forma individual en cualquier icono, carpeta o en cualquiera de los 15 widgets, además del ajuste global.
- **Saludo dinámico según la hora del día (`logoGreeting`):** *Buenos días / tardes / noches* (con soporte opcional de nombre) en el encabezado.
- **Pestaña dedicada «♥ Apoyar» y acceso discreto en modo edición:** botones limpios para apoyar en Ko-fi, calificar en Chrome Web Store y abrir incidencias o código fuente en GitHub, además de un acceso discreto en la barra de edición y un atajo para ajustar el color y pie de página de Chrome (`chrome://settings/appearance`).
- **Suite automática de pruebas de actualización (`tools/test_upgrade.js` y `tools/test_chrome_upgrade.py`):** valida 21 pruebas de sintaxis, paridad ES/EN, actualización sin respaldo desde v0.4.0/v0.5.0 y ausencia de permisos obligatorios nuevos.

### Cambiado
- **Internacionalización 100 % nativa con `chrome.i18n`:** todos los textos de interfaz se movieron a `_locales/es/messages.json` y `_locales/en/messages.json` (`default_locale: "en"`), reduciendo `js/i18n.js` de ~35 KB a < 1.5 KB y cargando solo un idioma en memoria. Los países de `WORLD_CITIES` se resuelven con códigos ISO y `Intl.DisplayNames`.
- **Conexión de Google Calendar simplificada:** campo de URL y botón *Conectar* unidos, validación directa y ayuda desplegable concisa (se pliega automáticamente al conectar).
- **Optimización profunda de arranque y fluidez:** caché de 7 días de favicons verificados (`ntp_fav_ok`, evitando lecturas repetidas de `<canvas>`), inicialización diferida de diálogos (`ensureSettingsUi()` / `ensureEditUi()`), pausa de `backdrop-filter` durante arrastre/temblor, galería de fondos diferida y actualización silenciosa a resolución completa `blob:` en reposo.
- **Instalaciones nuevas listas desde el primer segundo:** arrancan con el estilo *Aurora* (paisaje 4K + vidrio + widgets activos) sin alterar ninguna configuración de usuarios existentes que actualizan desde v0.5.0 o anteriores.
- **Diálogo «⚙ Pantalla» compacto:** diseño de 2 columnas sin scroll en la barra de edición.

### Corregido
- Corregido el estilo de inputs `type="text"`, `type="url"`, `type="time"` y `type="search"` en diálogos para heredar el tema oscuro/claro (incluyendo el campo `.ics` de Google Calendar y el diálogo de reunión rápida).
- Protección contra cuota llena de `localStorage` (`Store.flush()` prioriza `ntp_state_v1` si `ntp_bgimg` ocupa espacio y respeta `savedAt`).
- Reloj mundial ahora distingue ciudades con la misma zona horaria (`Barcelona`/`Madrid`, `Miami`/`Nueva York`).
- Ocultar un archivo en la tarjeta de Google Drive ya no llama a `chrome.history.deleteUrl`.
- Limpieza automática de referencias huérfanas de IndexedDB al importar respaldos en otro equipo, validación explícita de dominio para feeds `.ics` de Google Calendar y temporizador perezoso para el widget de Fotos.

## [0.5.0] – 2026-11-20
### Agregado
- **Tarjetas opcionales de Google Drive y Calendario de Google (`Ajustes → Drive y Calendar`):**
  - *Google Drive:* muestra automáticamente los últimos Documentos, Hojas de cálculo, Presentaciones, Formularios, PDFs y archivos de Drive abiertos en el navegador, con iconos por tipo de documento, tiempo relativo («Lo abriste hace...»), eliminación individual (`✕`) y vista ampliada en pop-up (`⤢`).
  - *Calendario de Google:* sincronización mediante enlace iCal (`.ics`), lectura directa de sesión o subida de archivo `.ics`/`.zip` exportado (sin necesidad de hacer público el calendario), con indicadores de estado («En curso», «En X min»), botón directo «Unirse a la reunión» para Google Meet/Zoom/Teams, diálogo para agregar reuniones rápidas y vista ampliada en pop-up (`⤢`).
- **Galería de 18 fondos incluidos y rotación automática (`Ajustes → Fondo`):** 12 fotografías QHD 2.5K de dominio público (NASA James Webb, ISS, U.S. National Park Service y La Gran Ola de Hokusai) + 6 paisajes vectoriales 4K propios (`bg/`), subida múltiple de imágenes propias a IndexedDB y rotación automática configurable (al abrir pestaña o por intervalo) permitiendo mezclar fondos incluidos con fotos propias.
- **Calculadora profunda:** historial interactivo clicable, botón `⌫` (borrar 1 dígito), botón `AC` (borrar todo / limpiar historial), botón `Ans` (usar último resultado), corrección de precisión decimal en coma flotante y soporte completo de teclado físico.
- **Tamaños ampliados hasta `4×3` y controles `+` / `−`:** nuevos tamaños `3×2`, `2×3`, `3×3`, `4×2` y `4×3`, botones separados para **Agrandar (`+`)** y **Achicar (`−`)** con salto inteligente de proporciones para cada widget, y soporte de widgets abiertos en los tres modos de disposición (*Cuadrícula*, *Filas a medida* y *Lista*).
- **Botón exprés «↶ Deshacer» en la barra de edición:** acceso directo en `#toolbar` para anular al instante cualquier acción (como crear una carpeta o pantalla por error al arrastrar).
- **Color propio e individual para enlaces de arriba a la derecha:** selector de color general y selector individual por cada enlace configurado en *Ajustes → Página*.
- **10 widgets adicionales:** calendario mensual, cuenta regresiva, temporizador Pomodoro, reloj mundial con buscador de ciudades, medidor de progreso temporal, álbum de fotos rotativas, registro semanal de hábitos, conversor de unidades y ejercicio de respiración guiada.
- **3 estilos de apertura de carpetas:** panel centrado (estilo modal iOS), burbuja contextual pegada a la carpeta y vista como pantalla completa.
- **Ventana «Configurar» para widgets:** diálogo dedicado para ajustar opciones de cada widget (diseño del reloj digital/analógico/minimalista/en palabras, fecha objetivo de cuenta regresiva, tiempos del temporizador, selector y buscador de ciudades para el reloj mundial, fotos locales, etc.).
- **3 estilos de apertura de carpetas:** panel centrado (estilo modal iOS), burbuja contextual pegada a la carpeta y vista como pantalla completa con botón para volver.
- **Configuración por pantalla mejorada:** selector visual de disposición (cuadrícula, filas o lista) con soporte para patrones y dimensiones personalizadas por pantalla.
- **Selector de colores interactivo:** paleta de acceso rápido con tonos Tailwind CSS más opción de selector nativo del sistema para todos los ajustes de color.
- **Avisos contextuales de personalización:** notas informativas («esto no cambiará…») en Ajustes cuando una pantalla o icono cuenta con configuración individual propia, con opción para aplicar los ajustes a todos los elementos.
- **Íconos discretos para pestañas:** nuevo diseño monocromático en 16 y 32 px (`icons/icon-small.svg`) para la pestaña y barra de Chrome, reservando el ícono colorido para la tienda y administración de extensiones.
- Altura configurable para la zona de interacción de las flechas de navegación lateral (`navZoneH`), con indicador visual interactivo al ajustar.

### Cambiado
- Arrastre y soltado más fluido con sincronización en `requestAnimationFrame` y mejor posicionamiento del punto de agarre.
- Las tareas en segundo plano no urgentes (marcadores, respaldos diarios automáticos y limpieza de fotos huérfanas en IndexedDB) se ejecutan con `requestIdleCallback` tras la carga para garantizar un inicio inmediato.
- Búsqueda en otros sitios: visualización en tabla de atajos configurados con lista editable plegable.
- En notas: botones para copiar texto al portapapeles, limpiar y visualización de caracteres.

### Quitado
- Selector de ícono de pestaña personalizado (migración v6) debido al comportamiento de parpadeo propio de Chrome.
- Widget de frase del día (migración v7) priorizando utilidades completamente autónomas y fuera de línea.

## [0.4.0] – 2026-10-14
### Cambiado
- La búsqueda usa **siempre el buscador predeterminado de Chrome**, como pide la política de la Chrome
  Web Store. Con el extra «Buscador avanzado» se puede elegir otro **solo para una búsqueda** (menú ⌄ o
  atajos como `yt gatos`). Se quitó el selector permanente; quien lo tenía configurado lo pierde al actualizar.
- El «logo a colores» usa una paleta propia.
- La descripción de la extensión se acortó a menos de 132 caracteres, el límite de Chrome.
### Agregado
- Aviso de privacidad en la bienvenida y en Ajustes → Datos.
- `PRIVACY.md`, textos de la tienda (`store/LISTING.md`) y `tools/build_zip.py`.

## [0.3.0] – 2026-10-13
### Agregado
- **Colocación libre** (como Android): cada icono se queda en su celda; soltar sobre otro icono crea una
  carpeta o los intercambia.
- Arrastre con **mouse, táctil y lápiz**; mantener presionado entra al modo edición.
- Sacar iconos de una carpeta arrastrando; arrastrar marcadores y enlaces de otras ventanas a la cuadrícula.
- **Menús de clic derecho** en iconos, marcadores y espacios vacíos.
- **Deshacer** y **copias automáticas** diarias (las últimas 7).
- Íconos con **inicial y color** para sitios sin favicon, y emojis como ícono.
- Ajustes en **pestañas** y tema claro, oscuro o automático para los paneles.
- **Extras opcionales:** widgets (reloj, notas, tareas), nombre y fondo por pantalla, buscador avanzado.
- **Español e inglés.** Íconos propios de la extensión y valores de fábrica neutros.
### Cambiado
- El código se dividió en archivos por responsabilidad (`core`, `interact`, `panels`, `widgets`, `i18n`, `main`).
### Quitado
- El elemento «Espacio»: con la colocación libre ya no hace falta. Los existentes se convierten en huecos.

## [0.2.0] – 2026-10-12
### Agregado
- Espacios fijos por pantalla, **sin scroll**; lo que no cabe pasa a la pantalla siguiente.
- Flechas laterales con **zona de clic** configurable, color y transparencia.
- Barra de marcadores, formas de icono, selector visual de disposición y confirmación al crear o borrar pantallas.
- Los primeros accesos se toman de los sitios más visitados, con nombres cortos y limpios.
### Cambiado
- Carga instantánea: el estado se lee de forma síncrona y el fondo se pinta antes del primer frame.

## [0.1.0] – 2026-10-11
### Agregado
- Primera versión: nueva pestaña con buscador, accesos ilimitados en varias pantallas, tamaños, carpetas,
  arrastrar y soltar, y ajustes de colores y fondo.

[1.0.0]: https://github.com/FHX23/new-tab-chrome-extension/releases/tag/v1.0.0
[0.5.0]: https://github.com/FHX23/new-tab-chrome-extension/releases/tag/v0.5.0
[0.4.0]: https://github.com/FHX23/new-tab-chrome-extension/releases/tag/v0.4.0
