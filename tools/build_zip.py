"""Arma el paquete para la Chrome Web Store: dist/mi-nueva-pestana-<versión>.zip

Incluye solo lo que la extensión necesita para funcionar (sin documentación, herramientas ni pruebas)
y revisa algunos límites que la tienda exige.
Uso:  python tools/build_zip.py
"""
import json
import os
import re
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
INCLUDE = ['manifest.json', 'newtab.html', 'css', 'js', 'icons', 'bg', '_locales']
SKIP_EXT = {'.md', '.py'}


def files():
    for item in INCLUDE:
        path = os.path.join(ROOT, item)
        if os.path.isfile(path):
            yield item
            continue
        for base, _, names in os.walk(path):
            for n in sorted(names):
                ext = os.path.splitext(n)[1]
                if ext in SKIP_EXT or (item == 'icons' and ext == '.svg'):
                    continue
                yield os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/')


def check(manifest):
    problems = []
    locales_dir = os.path.join(ROOT, '_locales')
    locales = {}
    for lang in sorted(os.listdir(locales_dir)):
        msgs = json.load(open(os.path.join(locales_dir, lang, 'messages.json'), encoding='utf-8'))
        locales[lang] = msgs
        if len(msgs['extName']['message']) > 75:
            problems.append(f'{lang}: el nombre supera 75 caracteres')
        if len(msgs['extDesc']['message']) > 132:
            problems.append(f'{lang}: la descripción supera 132 caracteres')
        seen_lower = set()
        for k, v in msgs.items():
            if not re.match(r'^[a-zA-Z0-9_]+$', k):
                problems.append(f'{lang}: clave inválida "{k}" (solo letras, números y _)')
            lk = k.lower()
            if lk in seen_lower:
                problems.append(f'{lang}: clave duplicada sin distinguir mayúsculas "{k}"')
            seen_lower.add(lk)
            if not isinstance(v, dict) or not v.get('message'):
                problems.append(f'{lang}: clave "{k}" vacía')
    base_lang = manifest.get('default_locale', 'en')
    if base_lang in locales:
        base_keys = set(locales[base_lang])
        for lang, msgs in locales.items():
            if lang == base_lang:
                continue
            keys = set(msgs)
            missing = sorted(base_keys - keys)
            extra = sorted(keys - base_keys)
            if missing:
                problems.append(f'{lang}: faltan claves respecto a {base_lang}: {", ".join(missing[:10])}')
            if extra:
                problems.append(f'{lang}: sobran claves respecto a {base_lang}: {", ".join(extra[:10])}')
            for k in base_keys & keys:
                p_base = sorted(set(re.findall(r'\$\d+', locales[base_lang][k]['message'])))
                p_cur = sorted(set(re.findall(r'\$\d+', msgs[k]['message'])))
                if p_base != p_cur:
                    problems.append(f'{lang}: placeholders distintos en "{k}" ({p_cur} vs {p_base})')
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
