"""Arma el paquete para la Chrome Web Store: dist/mi-nueva-pestana-<versión>.zip

Incluye solo lo que la extensión necesita para funcionar (sin documentación, herramientas ni pruebas)
y revisa algunos límites que la tienda exige.
Uso:  python tools/build_zip.py
"""
import json
import os
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
INCLUDE = ['manifest.json', 'newtab.html', 'css', 'js', 'icons', '_locales']
SKIP_EXT = {'.svg', '.md', '.py'}


def files():
    for item in INCLUDE:
        path = os.path.join(ROOT, item)
        if os.path.isfile(path):
            yield item
            continue
        for base, _, names in os.walk(path):
            for n in sorted(names):
                if os.path.splitext(n)[1] in SKIP_EXT:
                    continue
                yield os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/')


def check(manifest):
    problems = []
    for lang in os.listdir(os.path.join(ROOT, '_locales')):
        msgs = json.load(open(os.path.join(ROOT, '_locales', lang, 'messages.json'), encoding='utf-8'))
        if len(msgs['extName']['message']) > 75:
            problems.append(f'{lang}: el nombre supera 75 caracteres')
        if len(msgs['extDesc']['message']) > 132:
            problems.append(f'{lang}: la descripción supera 132 caracteres')
    for size, path in manifest.get('icons', {}).items():
        if not os.path.isfile(os.path.join(ROOT, path)):
            problems.append(f'falta el ícono {path}')
    for f in files():
        if f.endswith(('.js', '.html')):
            text = open(os.path.join(ROOT, f), encoding='utf-8').read()
            if 'stub.js' in text or 'http://localhost' in text:
                problems.append(f'{f}: contiene restos de pruebas')
    return problems


if __name__ == '__main__':
    manifest = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))
    problems = check(manifest)
    if problems:
        raise SystemExit('No se armó el paquete:\n- ' + '\n- '.join(problems))
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    out = os.path.join(ROOT, 'dist', f"mi-nueva-pestana-{manifest['version']}.zip")
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files():
            z.write(os.path.join(ROOT, f), f)
    print(f'{os.path.relpath(out, ROOT)}  ({os.path.getsize(out) // 1024} KB, {len(list(files()))} archivos)')
