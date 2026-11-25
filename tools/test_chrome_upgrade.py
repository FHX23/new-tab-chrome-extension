"""Simulador real en Chrome aislado para probar actualizaciones sin perder datos
y probar idiomas (español, inglés y fallback desde otro idioma como francés).

No toca tu perfil principal de Chrome ni modifica tus datos reales.

Uso:
  1) Probar actualización real (v0.5.0 -> versión local actual) sin respaldo:
       python tools/test_chrome_upgrade.py
     - Paso 1: Abre Chrome aislado con el último .zip publicado en dist/.
       Crea carpetas, notas, fondos y accesos (sin hacer respaldo) y CIERRA esa ventana.
     - Paso 2: Automáticamente copia los archivos locales encima de la MISMA carpeta
       y reabre Chrome con el MISMO perfil para confirmar 0 pérdida de datos.

  2) Probar solo la versión local actual en otro idioma (ej. inglés o francés -> inglés):
       python tools/test_chrome_upgrade.py --current-only --lang=en
       python tools/test_chrome_upgrade.py --current-only --lang=fr

Opciones:
  --lang=<code>     Idioma UI de Chrome en la prueba (ej: es, en, fr). Por defecto: sistema.
  --from=<zip>      Ruta a un .zip anterior específico (por defecto: el último en dist/).
  --current-only    Abre solo el código local actual en perfil limpio (sin fase previa).
  --keep            Conserva la carpeta temporal al salir para inspeccionarla.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
INCLUDE = ['manifest.json', 'newtab.html', 'css', 'js', 'icons', 'bg', '_locales']
SKIP_EXT = {'.md', '.py'}


def find_chrome():
    candidates = [
        shutil.which('chrome'),
        shutil.which('google-chrome'),
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
        os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    raise SystemExit('No se encontró chrome.exe. Indícalo en PATH o instala Google Chrome.')


def latest_dist_zip():
    dist_dir = os.path.join(ROOT, 'dist')
    if not os.path.isdir(dist_dir):
        return None
    zips = [f for f in os.listdir(dist_dir) if re.match(r'^mi-nueva-pestana-\d+\.\d+\.\d+\.zip$', f)]
    if not zips:
        return None
    zips.sort(key=lambda name: tuple(map(int, re.findall(r'\d+', name))))
    return os.path.join(dist_dir, zips[-1])


def copy_workspace_to(dest_dir):
    if os.path.isdir(dest_dir):
        shutil.rmtree(dest_dir)
    os.makedirs(dest_dir, exist_ok=True)
    for item in INCLUDE:
        src = os.path.join(ROOT, item)
        dst = os.path.join(dest_dir, item)
        if os.path.isfile(src):
            shutil.copy2(src, dst)
        elif os.path.isdir(src):
            for base, _, names in os.walk(src):
                rel_base = os.path.relpath(base, ROOT)
                out_base = os.path.join(dest_dir, rel_base)
                os.makedirs(out_base, exist_ok=True)
                for n in names:
                    ext = os.path.splitext(n)[1]
                    if ext in SKIP_EXT or (item == 'icons' and ext == '.svg'):
                        continue
                    shutil.copy2(os.path.join(base, n), os.path.join(out_base, n))


def launch_chrome(chrome_bin, profile_dir, ext_dir, lang=None):
    cmd = [
        chrome_bin,
        f'--user-data-dir={profile_dir}',
        f'--load-extension={ext_dir}',
        '--no-first-run',
        '--no-default-browser-check',
        'chrome://newtab',
    ]
    if lang:
        cmd.append(f'--lang={lang}')
    return subprocess.run(cmd)


def main():
    ap = argparse.ArgumentParser(description='Simulador aislado de actualización e idioma en Chrome')
    ap.add_argument('--lang', default=None, help='Idioma de Chrome (es, en, fr, etc.)')
    ap.add_argument('--from', dest='from_zip', default=None, help='ZIP de versión previa en dist/')
    ap.add_argument('--current-only', action='store_true', help='Probar solo el código local actual')
    ap.add_argument('--keep', action='store_true', help='No borrar la carpeta temporal al terminar')
    args = ap.parse_args()

    chrome_bin = find_chrome()
    tmp = tempfile.mkdtemp(prefix='ntp_upgrade_test_')
    profile_dir = os.path.join(tmp, 'profile')
    ext_dir = os.path.join(tmp, 'ext')

    try:
        if args.current_only:
            copy_workspace_to(ext_dir)
            print(f'[Prueba local] Abriendo Chrome aislado (lang={args.lang or "sistema"})...')
            print('Cierra la ventana de prueba al terminar.')
            launch_chrome(chrome_bin, profile_dir, ext_dir, args.lang)
            return

        prev_zip = args.from_zip or latest_dist_zip()
        if not prev_zip or not os.path.isfile(prev_zip):
            raise SystemExit('No se encontró ningún .zip previo en dist/. Usa --from=<ruta.zip> o --current-only.')

        os.makedirs(ext_dir, exist_ok=True)
        with zipfile.ZipFile(prev_zip, 'r') as z:
            z.extractall(ext_dir)

        print('=' * 68)
        print(f'FASE 1 / 2 · Versión anterior: {os.path.basename(prev_zip)}')
        print('  1. Crea carpetas, notas, widgets, sube un fondo y cambia ajustes.')
        print('  2. NO hagas respaldo manual.')
        print('  3. CIERRA por completo esa ventana de Chrome para simular el update.')
        print('=' * 68)
        launch_chrome(chrome_bin, profile_dir, ext_dir, args.lang)

        print('\nAplicando actualización in-place sobre la misma carpeta de extensión...')
        copy_workspace_to(ext_dir)

        print('=' * 68)
        print('FASE 2 / 2 · Versión local actual (mismo perfil y mismo ID)')
        print('  Verifica que todos tus datos, notas, carpetas y fondos siguen intactos,')
        print('  y prueba las funciones nuevas (altura vertical, barra ⚙ Pantalla, i18n).')
        print('  Cierra la ventana al terminar.')
        print('=' * 68)
        launch_chrome(chrome_bin, profile_dir, ext_dir, args.lang)
    finally:
        if args.keep:
            print(f'\nCarpeta temporal conservada en: {tmp}')
        else:
            shutil.rmtree(tmp, ignore_errors=True)
            print('\nEntorno temporal limpiado.')


if __name__ == '__main__':
    main()
