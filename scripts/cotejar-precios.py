#!/usr/bin/env python3
"""
Coteja una planilla de precios de proveedores contra el catálogo.

Pensado para las que manda Nicolás ("Base de datos de precios"), que llegan
periódicamente. Lee la hoja `Base de precios`, resuelve las fórmulas (vienen sin
calcular), empareja cada renglón con una ficha y reporta la diferencia.

    python3 scripts/cotejar-precios.py "datos-entrada/Base de datos de precios - Nicolas.xlsx"

Deja un JSON al lado del Excel con el detalle completo, e imprime el resumen.

NO TOCA NADA. Es sólo lectura: no escribe precios ni crea fichas. Para aplicar
un precio hay una sola puerta, que es `fijar_precio_ref` (CLAUDE.md §5.14).

Dos trampas que el script vigila, porque son las que arruinan este cotejo:

  1. UNIDAD. La planilla trae precio por envase y precio por unidad base. Si la
     ficha se mide por envase (unid, rollo, balde...) hay que comparar contra el
     precio del envase; si se mide por contenido (m, kg, lt) contra el de la
     unidad base. Compararlos cruzados da diferencias de 80-90% que no existen.

  2. PRESENTACIÓN. "TORNILLO X 100 UN" contra una ficha por unidad da +9.900%, y
     no es un aumento: es una caja contra un tornillo. Lo mismo con 600 ml contra
     300 ml, o 18 kg contra 32 kg. El script extrae las cantidades del texto de
     los dos lados y marca el renglón cuando no coinciden.
"""
import json, os, re, sys, unicodedata, urllib.request

IVA_DEFAULT = 0.21
PAQUETE = {'unid', 'rollo', 'lata', 'balde', 'bolsa', 'caja', 'par', 'juego', 'tira', 'pack'}
UMBRAL_NOMBRE = 0.34      # similitud mínima para proponer un match por nombre
UMBRAL_ALERTA = 0.20      # a partir de acá el cambio de precio se destaca


def env_backend():
    """Las credenciales salen del .env del backend, igual que el script de fotos."""
    ruta = os.path.expanduser('~/cadincsrl/.env')
    env = {}
    for linea in open(ruta, encoding='utf-8'):
        if '=' in linea and not linea.lstrip().startswith('#'):
            k, _, v = linea.partition('=')
            env[k.strip()] = v.strip()
    return env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']


def traer_catalogo(url, key):
    """PostgREST corta en 1000 filas por respuesta, así que se pagina con Range
    y orden estable (CLAUDE.md §5.7). Sin el `order`, las páginas se solapan."""
    fichas, desde, PASO = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{url}/rest/v1/stock_materiales"
            "?select=id,nombre,unidad,precio_ref,alias,clase&activo=eq.true&order=id",
            headers={'apikey': key, 'Authorization': f'Bearer {key}',
                     'Range': f'{desde}-{desde + PASO - 1}'})
        lote = json.loads(urllib.request.urlopen(req).read())
        fichas += lote
        if len(lote) < PASO:
            return fichas
        desde += PASO


def norm(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).split()


def cantidades(texto):
    """Números que denotan presentación: '600 ML', '18 KGS', '2,60 MTS'.
    Sirven para detectar caja-contra-unidad, que es el falso positivo más caro."""
    t = str(texto or '').lower().replace(',', '.')
    out = set()
    for n, u in re.findall(r'(\d+(?:\.\d+)?)\s*(ml|cc|lts|lt|kgs|kg|grs|gr|mts|mt|cm|mm)\b', t):
        v = float(n)
        if u in ('kgs', 'kg'): out.add(('kg', v))
        elif u in ('grs', 'gr'): out.add(('kg', v / 1000))
        elif u in ('lts', 'lt'): out.add(('lt', v))
        elif u in ('ml', 'cc'): out.add(('lt', v / 1000))
        elif u in ('mts', 'mt'): out.add(('m', v))
        elif u == 'cm': out.add(('m', v / 100))
        elif u == 'mm': out.add(('mm', v))
    return out


def es_pack(texto):
    """'X 100 UN', 'X 500 UN', 'BLISTER X 4': la planilla cotiza la caja y la
    ficha suele ser por unidad. Devuelve cuántas unidades trae, o None."""
    m = re.search(r'\bx\s*(\d{2,4})\s*(?:un\b|u\b|unidades\b|$)', str(texto or '').lower())
    return int(m.group(1)) if m else None


def leer_planilla(ruta):
    import openpyxl
    wb = openpyxl.load_workbook(ruta, data_only=False)
    iva = wb['Notas']['B4'].value if 'Notas' in wb.sheetnames else IVA_DEFAULT
    ws = wb['Base de precios']
    filas = []
    for r in range(2, ws.max_row + 1):
        lista, base, desc_pct = ws.cell(r, 7).value, ws.cell(r, 8).value, ws.cell(r, 9).value or 0
        if not isinstance(lista, (int, float)):
            continue
        # el comprobante puede venir neto o con IVA; la planilla lo dice en la columna H
        neto = lista * (1 - desc_pct) if base == 'Neto' else lista / (1 + iva) * (1 - desc_pct)
        contenido = ws.cell(r, 13).value
        filas.append(dict(
            fila=r, rubro=ws.cell(r, 1).value, prov=ws.cell(r, 2).value,
            fecha=str(ws.cell(r, 3).value)[:10], cod=(str(ws.cell(r, 4).value).strip()
                                                      if ws.cell(r, 4).value else ''),
            desc=ws.cell(r, 5).value, unidad_base=ws.cell(r, 12).value, contenido=contenido,
            civa=round(neto * (1 + iva), 2),
            base_civa=round(neto * (1 + iva) / contenido, 2)
            if isinstance(contenido, (int, float)) and contenido else None))
    return filas, iva


def cotejar(filas, fichas):
    por_alias = {}
    for f in fichas:
        for a in (f.get('alias') or []):
            por_alias.setdefault(str(a).strip().lower(), f)
    tokens = {f['id']: set(norm(f['nombre'])) for f in fichas}

    # un renglón por producto: el comprobante más nuevo gana
    ultimo = {}
    for f in sorted(filas, key=lambda x: x['fecha']):
        ultimo[f['cod'].lower() or str(f['desc']).lower()] = f

    salida = []
    for f in ultimo.values():
        ficha, via = (por_alias.get(f['cod'].lower()) if f['cod'] else None), 'codigo'
        if not ficha:
            t, mejor, puntaje = set(norm(f['desc'])), None, 0
            for c in fichas:
                ct = tokens[c['id']]
                if not ct:
                    continue
                j = len(t & ct) / len(t | ct)
                if j > puntaje:
                    puntaje, mejor = j, c
            ficha, via = (mejor, f'nombre {puntaje:.0%}') if puntaje >= UMBRAL_NOMBRE else (None, None)
        if not ficha:
            salida.append(dict(estado='sin_ficha', **{k: f[k] for k in ('cod', 'desc', 'prov', 'fecha', 'rubro')},
                               precio=f['civa']))
            continue

        # la columna correcta depende de cómo se mide la ficha
        nuevo = f['civa'] if ficha['unidad'] in PAQUETE else (f['base_civa'] or f['civa'])
        actual = float(ficha['precio_ref'] or 0)
        dif = round((nuevo - actual) / actual * 100, 1) if actual and nuevo else None

        # ¿hablan de la misma presentación? dos señales distintas
        ce, cf = cantidades(f['desc']), cantidades(ficha['nombre'])
        choque = sorted({u for u, _ in ce} & {u for u, _ in cf}
                        - {u for u, v in ce if any(u == u2 and abs(v - v2) < 0.01 for u2, v2 in cf)})
        pack = es_pack(f['desc'])
        motivo = None
        if choque:
            motivo = 'la medida del envase no coincide (' + ', '.join(choque) + ')'
        elif pack and ficha['unidad'] in ('unid', 'un'):
            motivo = f'la planilla cotiza la caja de {pack} y la ficha va por unidad'
        # un salto grande sobre un match por nombre flojo es otro producto, no un aumento
        elif via != 'codigo' and dif is not None and abs(dif) >= UMBRAL_ALERTA * 100:
            motivo = 'emparejado por nombre y con salto grande: probablemente no es el mismo producto'

        if actual == 0:
            estado = 'sin_precio'
        elif motivo:
            estado = 'revisar'
        elif via == 'codigo':
            estado = 'firme'
        else:
            estado = 'probable'

        salida.append(dict(
            estado=estado, via=via, cod=f['cod'], desc=f['desc'], prov=f['prov'],
            fecha=f['fecha'], rubro=f['rubro'], ficha=ficha['id'], nombre=ficha['nombre'],
            unidad=ficha['unidad'], clase=ficha['clase'], actual=actual, nuevo=nuevo,
            dif=dif, motivo=motivo))
    return salida


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ruta = sys.argv[1]
    filas, iva = leer_planilla(ruta)
    url, key = env_backend()
    fichas = traer_catalogo(url, key)
    res = cotejar(filas, fichas)

    cuenta = lambda e: [r for r in res if r['estado'] == e]
    firme, probable, revisar = cuenta('firme'), cuenta('probable'), cuenta('revisar')
    cero, sin = cuenta('sin_precio'), cuenta('sin_ficha')
    comparables = firme + probable
    mueven = [r for r in comparables if r['dif'] is not None
              and abs(r['dif']) >= UMBRAL_ALERTA * 100]

    print(f"IVA de la planilla: {iva:.0%}   ·   catálogo: {len(fichas)} fichas activas")
    print(f"{len(res)} productos en la planilla\n")
    print(f"  {len(firme):4}  FIRMES     emparejados por código del proveedor")
    print(f"  {len(probable):4}  PROBABLES  por nombre, y el precio cierca: eso mismo confirma el match")
    print(f"  {len(revisar):4}  A REVISAR  el match no convence, ver el motivo de cada uno")
    print(f"  {len(cero):4}  SIN PRECIO la ficha está en $0, no hay contra qué comparar")
    print(f"  {len(sin):4}  SIN FICHA  no existe en el catálogo")

    if mueven:
        print(f"\n  de los {len(comparables)} comparables, {len(mueven)} se mueven más de "
              f"{UMBRAL_ALERTA:.0%}:")
        for r in sorted(mueven, key=lambda x: -abs(x['dif'])):
            print(f"    {r['dif']:+7.1f}%  #{r['ficha']:<5} {r['nombre'][:40]:40} "
                  f"${r['actual']:>10,.0f} -> ${r['nuevo']:>10,.0f}")
    if revisar:
        print(f"\n  los 6 primeros a revisar:")
        for r in sorted(revisar, key=lambda x: -abs(x['dif'] or 0))[:6]:
            print(f"    #{r['ficha']:<5} {r['nombre'][:36]:36} {r['motivo']}")

    destino = os.path.splitext(ruta)[0] + ' - cotejo.json'
    json.dump(res, open(destino, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"\ndetalle completo en:\n  {destino}")


if __name__ == '__main__':
    main()
