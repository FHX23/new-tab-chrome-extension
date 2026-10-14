# Cambios · Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones 0.x = preliminares.

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

[0.4.0]: https://github.com/FHX23/new-tab-chrome-extension/releases/tag/v0.4.0
