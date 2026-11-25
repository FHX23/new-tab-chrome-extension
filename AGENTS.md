# AGENTS.md — Guía operativa para agentes (Mi Nueva Pestaña)

Este archivo define las reglas del repositorio, las pruebas automáticas de actualización y el procedimiento completo para publicar una nueva versión (extensión, GitHub Release y sitio web oficial).

---

## 1. Reglas críticas del proyecto

1. **Trabajo local por defecto:** **NO** hagas `git push`, **NO** crees tags ni GitHub Releases, **NO** subas la versión en `manifest.json` y **NO** modifiques el repositorio web hasta que el usuario indique explícitamente que quiere publicar una nueva versión.
2. **Sin librerías ni paso de compilación:** todo es HTML, CSS y JS clásico escrito a mano (`js/i18n.js → store.js → core.js → widgets.js → interact.js → panels.js → main.js`). Mantener pintado completo en el primer frame (`< 1 ms`) y evitar carga asíncrona en el camino crítico.
3. **Internacionalización nativa (`chrome.i18n`):**
   - Todos los textos de la interfaz viven en `_locales/es/messages.json` y `_locales/en/messages.json`.
   - `manifest.json` mantiene `"default_locale": "en"`, de modo que Chrome carga **solo 1 idioma** en memoria (`es*` → español; inglés y cualquier otro idioma → inglés).
   - Claves permitidas por Chrome: solo `[a-zA-Z0-9_]` (sin guiones `-`), sin duplicados al ignorar mayúsculas/minúsculas, y placeholders `$1`, `$2`… con paridad exacta entre `es` y `en`.
   - `js/i18n.js` debe mantenerse mínimo (`< 3 KB`), delegando a `chrome.i18n.getMessage()`.
4. **Compatibilidad total con usuarios existentes (cero pérdida de datos):**
   - **Nunca** renombres las claves de almacenamiento (`ntp_state_v1`, `ntp_bgimg`, `ntp_backups`) ni la base IndexedDB (`ntp` v1) sin una migración probada.
   - Todo campo nuevo en `DEFAULT_SETTINGS` o en páginas (`PAGE_KEYS`) debe tener valor por defecto compatible con versiones previas usando `??` / `!= null` (especialmente cuando `0` o `false` son valores válidos).
   - **Nunca** agregues permisos obligatorios nuevos (`permissions` o `host_permissions`) en `manifest.json` sin confirmación explícita del usuario: agregar permisos obligatorios desactiva la extensión en los usuarios actuales hasta que re-aprueben manualmente. Cualquier permiso nuevo debe ir en `optional_permissions` / `optional_host_permissions`.
5. **Políticas de Chrome Web Store:**
   - La búsqueda usa siempre `chrome.search.query()` (buscador predeterminado de Chrome).
   - Sin telemetría, sin analítica, sin código remoto y sin usar la marca «Google» en el logo por defecto ni en capturas.

---

## 2. Repositorios y enlaces del ecosistema

| Componente | Ruta local | Repositorio remoto / destino |
|---|---|---|
| **Extensión Chrome** | `C:\Users\xgall\Desktop\google chrome extension` | `https://github.com/FHX23/new-tab-chrome-extension` |
| **GitHub Releases** | `dist/mi-nueva-pestana-<X.Y.Z>.zip` | `https://github.com/FHX23/new-tab-chrome-extension/releases` |
| **Sitio web oficial** | `C:\Users\xgall\Desktop\mi-nueva-pestana-web` | `https://github.com/FHX23/mi-nueva-pestana-web` (Vercel auto-deploy → `https://mi-nueva-pestana.vercel.app`) |
| **Chrome Web Store** | Subida manual del `.zip` | `https://chromewebstore.google.com/detail/nacaekbeegbhbhianboflddghiophdpm` |

---

## 3. Pruebas automáticas (ejecutar siempre antes de cualquier release)

### A. Suite automática completa (obligatoria, < 2 segundos)
```powershell
node tools/test_upgrade.js
```
Valida automáticamente:
- Sintaxis JS (`node --check`) en todos los archivos de `js/`.
- `tools/build_zip.py` `check()` (límites de Chrome Web Store, íconos, paridad exacta de claves ES/EN, placeholders `$1`/`$2`, ausencia de colisiones por mayúsculas/minúsculas).
- Que **no** se agregaron permisos obligatorios nuevos ni cambiaron claves de almacenamiento (`localStorage`, `chrome.storage.local`, `IndexedDB`) frente al último `.zip` publicado en `dist/`.
- Simulación de actualización **sin respaldo** desde estados reales de `v0.4.0` y `v0.5.0` hacia el código actual en `es-CL`, `en-US`, `fr-FR` (fallback → `en`) y `ja-JP` (fallback → `en`).
- Cobertura de `data-i18n*`, llamadas `t()`, `WORLD_CITIES` ISO (`Intl.DisplayNames`) y lógica de `gridY` global/por pantalla.

### B. Simulador real 1:1 en Chrome aislado (recomendado antes de publicar)
No toca el perfil principal del usuario:
```powershell
# Simula update real: abre último .zip de dist/ -> cierras ventana -> aplica código local encima y reabre mismo perfil
python tools/test_chrome_upgrade.py

# Prueba rápida solo de la versión local en otro idioma (inglés o fallback desde francés)
python tools/test_chrome_upgrade.py --current-only --lang=en
python tools/test_chrome_upgrade.py --current-only --lang=fr
```

---

## 4. Protocolo de Release (solo cuando el usuario pida lanzar `vX.Y.Z`)

Seguir este orden exacto y confirmar el número de versión `X.Y.Z` con el usuario si no lo especificó.

### Paso 1 · Preparar y empaquetar el repositorio de la extensión
1. Revisar `git status` y `git diff` para asegurarse de que solo entran los cambios deseados (sin archivos temporales).
2. Actualizar versión y documentación:
   - `manifest.json`: subir `"version"` a `"X.Y.Z"`.
   - `CHANGELOG.md`: añadir sección `## [X.Y.Z] – YYYY-MM-DD` (Agregado / Cambiado / Corregido) y enlace `[X.Y.Z]` al pie.
   - `README.md`: actualizar badges, enlaces de descarga `mi-nueva-pestana-X.Y.Z.zip` y resumen de funciones (ES y EN), además de la nota sobre `_locales/`.
   - `docs/ARQUITECTURA.md`: actualizar versión del paquete `.zip` y arquitectura si cambió algo relevante.
   - `store/LISTING.md`: actualizar descripción detallada ES/EN si hay funciones destacables nuevas.
3. Ejecutar la suite automática y verificar **0 fallos**:
   ```powershell
   node tools/test_upgrade.js
   ```
4. Construir el paquete oficial de distribución:
   ```powershell
   python tools/build_zip.py
   ```
   Confirmar que generó `dist/mi-nueva-pestana-X.Y.Z.zip` sin advertencias.
5. Hacer commit y tag en el repositorio de la extensión y subir al remoto:
   ```powershell
   git add -A
   git commit -m "release: vX.Y.Z"
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main --tags
   ```

### Paso 2 · Crear el Release público en GitHub
Usar GitHub CLI (`gh`) adjuntando el `.zip` recién generado (el nombre del archivo debe ser exactamente `mi-nueva-pestana-X.Y.Z.zip` para que los enlaces `/releases/latest/download/mi-nueva-pestana-X.Y.Z.zip` funcionen):

```powershell
gh release create vX.Y.Z "dist/mi-nueva-pestana-X.Y.Z.zip" `
  --repo FHX23/new-tab-chrome-extension `
  --title "vX.Y.Z — <Resumen breve>" `
  --notes "<Notas de versión extraídas de CHANGELOG.md>"
```
Verificar que el release quedó publicado (no borrador) y con el `.zip` descargable mediante `gh release view vX.Y.Z`.

### Paso 3 · Actualizar y desplegar el sitio web oficial (`mi-nueva-pestana-web`)
Trabajar en `C:\Users\xgall\Desktop\mi-nueva-pestana-web`:
1. Comprobar estado limpio:
   ```powershell
   git -C "C:\Users\xgall\Desktop\mi-nueva-pestana-web" status
   git -C "C:\Users\xgall\Desktop\mi-nueva-pestana-web" pull --ff-only
   ```
2. Buscar todas las menciones a la versión anterior antes de editar:
   ```powershell
   Select-String -Path "C:\Users\xgall\Desktop\mi-nueva-pestana-web\index.html","C:\Users\xgall\Desktop\mi-nueva-pestana-web\app.js","C:\Users\xgall\Desktop\mi-nueva-pestana-web\PRODUCT.md","C:\Users\xgall\Desktop\mi-nueva-pestana-web\README.md" -Pattern "0\.\d+\.\d+|mi-nueva-pestana-"
   ```
3. Actualizar:
   - `index.html`: número de versión (`vX.Y.Z`), enlaces a `https://github.com/FHX23/new-tab-chrome-extension/releases/latest/download/mi-nueva-pestana-X.Y.Z.zip` (o `/releases/tag/vX.Y.Z`) y novedades visibles.
   - `app.js`: actualizar referencias de versión o elementos de la demo interactiva si corresponden.
   - `PRODUCT.md` y `README.md`: actualizar versión y referencia del `.zip`.
   - `assets/`: si existe copia de respaldo `assets/mi-nueva-pestana-<prev>.zip`, copiar `dist/mi-nueva-pestana-X.Y.Z.zip` en su lugar y eliminar el `.zip` antiguo.
4. Verificar que no queden referencias obsoletas a la versión anterior y revisar `git diff`.
5. Hacer commit y push (Vercel despliega automáticamente a `https://mi-nueva-pestana.vercel.app`):
   ```powershell
   git -C "C:\Users\xgall\Desktop\mi-nueva-pestana-web" add -A
   git -C "C:\Users\xgall\Desktop\mi-nueva-pestana-web" commit -m "release: actualizar sitio a vX.Y.Z"
   git -C "C:\Users\xgall\Desktop\mi-nueva-pestana-web" push origin main
   ```

### Paso 4 · Cierre y entrega para Chrome Web Store
Al finalizar los pasos 1 a 3, entregar al usuario:
- Enlace al GitHub Release público (`https://github.com/FHX23/new-tab-chrome-extension/releases/tag/vX.Y.Z`) y confirmación del push al sitio web (`https://mi-nueva-pestana.vercel.app`).
- Ruta del archivo listo para subir manualmente al panel de la Chrome Web Store: `dist/mi-nueva-pestana-X.Y.Z.zip`.
- Confirmación explícita de que **no cambiaron permisos obligatorios** (actualización silenciosa y sin pérdida de datos para usuarios existentes) y resumen de novedades ES/EN listo para pegar en la tienda.
