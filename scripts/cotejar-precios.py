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
UMBRAL_NOMBRE = 0.50      # cobertura ponderada mínima del texto del proveedor para proponer match
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
    # Las fracciones sobreviven como UN token: 1/2 -> 1|2, y 1-1/2 o 1.1/2 -> 1|1|2.
    # Sin esto la medida se desarma en digitos sueltos y "1/2" matchea igual de
    # bien a una ficha de 1-1/2 que a la de 1/2: fue exactamente lo que paso el
    # 14/09 con las planchuelas, donde los precios de la 1/2 y la 3/4 se
    # atribuyeron a la ficha de 1-1/2 (que ademas estaba en $0) y las dos fichas
    # con precio nunca se compararon. En herreria y sanitaria la fraccion ES el
    # producto.
    s = re.sub(r'(\d+)\s*[-.]\s*(\d+)\s*/\s*(\d+)', r' \1|\2|\3 ', s)
    s = re.sub(r'(\d+)\s*/\s*(\d+)', r' \1|\2 ', s)
    return re.sub(r'[^a-z0-9|]+', ' ', s).split()


def pesos_de(lista_tokens):
    """Devuelve la función de peso para UN texto de proveedor.

    Sin pesos todos los tokens valen igual y "PLANCHUELA 3/4 X 1/8" empata con
    un ÁNGULO de 3/4 y con la planchuela correcta: los dos comparten tres
    tokens, sólo que el ángulo comparte números y la planchuela comparte el
    sustantivo. Ganaba el de id más bajo, o sea el ángulo.

    Dos señales, en orden de importancia:
      · el SUSTANTIVO (primer token alfabético) es QUÉ es la cosa. Un ángulo no
        es una planchuela por más medidas que compartan.
      · la MEDIDA en fracción: en herrería y sanitaria 1/2 no es 1-1/2.
    Un dígito suelto o una letra sola ("x", "1", "92") no dicen nada.
    """
    sust = next((x for x in lista_tokens if x.isalpha() and len(x) >= 3), None)

    def w(tok):
        # Un código de producto (1tmf202006r1400p, ez9r36240, kd40710) es prueba
        # dura: identifica la pieza exacta, incluida la marca. Sin esto el
        # disyuntor ABB de la planilla se emparejaba con la ficha del SCHNEIDER
        # equivalente, que cuesta distinto, aunque la ficha del ABB tuviera el
        # código del renglón cargado como sinónimo.
        if len(tok) >= 6 and not tok.isdigit() and not tok.isalpha() and '|' not in tok:
            return 8
        if tok == sust:
            return 5
        if '|' in tok:
            return 3
        if len(tok) == 1 or tok.isdigit():
            return 1
        return 2
    return w


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
            if isinstance(contenido, (int, float)) and contenido else None,
            # El numero que se copia del comprobante tal cual, SIN bonificacion y
            # SIN IVA. No sirve para tasar; sirve para detectar al que lo cargo
            # asi, que es el error de carga mas comun (tornilleria 14/09).
            lista_env=round(lista, 2),
            lista_base=round(lista / contenido, 2)
            if isinstance(contenido, (int, float)) and contenido else None))
    return filas, iva


def cotejar(filas, fichas):
    por_alias = {}
    for f in fichas:
        for a in (f.get('alias') or []):
            por_alias.setdefault(str(a).strip().lower(), f)
    # El emparejamiento por nombre mira TAMBIÉN los sinónimos. Sin esto se pierden
    # todas las fichas cuyo nombre técnico no se parece al del proveedor: la jabalina
    # ("Jabalina puesta a tierra" contra "JABALINA 1/2 X 1.5 M C/TOMACABLE"), las
    # cuplas contra las "uniones", las "Terminal puntera" contra las "PUNTERA HUECA
    # TUBULAR". Varias de esas fichas ya tenían el texto del proveedor cargado como
    # sinónimo de una tanda anterior, y aun así no matcheaban.
    tokens = {f['id']: set(norm(f['nombre'] + ' ' + ' '.join(f.get('alias') or [])))
              for f in fichas}

    # un renglón por producto: el comprobante más nuevo gana
    ultimo = {}
    for f in sorted(filas, key=lambda x: x['fecha']):
        ultimo[f['cod'].lower() or str(f['desc']).lower()] = f

    salida = []
    for f in ultimo.values():
        ficha, via = (por_alias.get(f['cod'].lower()) if f['cod'] else None), 'codigo'
        if not ficha:
            tl = norm(f['desc'])
            t, mejor, puntaje = set(tl), None, 0
            peso = pesos_de(tl)
            total = sum(peso(x) for x in t) or 1
            for c in fichas:
                ct = tokens[c['id']]
                if not ct:
                    continue
                # cobertura PONDERADA del texto del proveedor, NO Jaccard: una ficha
                # con 20 sinónimos tiene un blob enorme y el Jaccard la hunde sin
                # motivo. Los pesos están en peso(): la medida vale más que un
                # dígito suelto, que es lo que separa la ficha correcta del vecino
                # que comparte números por casualidad.
                j = sum(peso(x) for x in (t & ct)) / total
                # Desempate: gana la que TIENE precio. Con puntaje igual, una ficha
                # en $0 es casi siempre la que nadie usa, y elegirla deja el renglón
                # en "sin_precio" — o sea que el cotejo da verde y la ficha que sí
                # se factura nunca se compara (planchuelas, 14/09).
                if j > puntaje or (j == puntaje and j > 0 and mejor is not None
                                   and float(c['precio_ref'] or 0) > 0
                                   and float(mejor['precio_ref'] or 0) == 0):
                    puntaje, mejor = j, c
            ficha, via = (mejor, f'nombre {puntaje:.0%}') if puntaje >= UMBRAL_NOMBRE else (None, None)
        if not ficha:
            salida.append(dict(estado='sin_ficha', **{k: f[k] for k in ('cod', 'desc', 'prov', 'fecha', 'rubro')},
                               precio=f['civa']))
            continue

        # 'unid' en la ficha es UNA pieza. Si la planilla cotiza la caja y su
        # unidad base también son unidades, lo comparable es el precio de la
        # pieza, no el de la caja: con la regla de PAQUETE sola, los seis
        # tornillos de durlock daban +9.900% y quedaban en "revisar" para
        # siempre, que es como el error de IVA del 14/09 sobrevivió al cotejo.
        por_pieza = (str(f.get('unidad_base') or '').lower() in ('un', 'u', 'unid')
                     and isinstance(f['contenido'], (int, float)) and f['contenido'] > 1)

        # la columna correcta depende de cómo se mide la ficha
        if por_pieza and f['base_civa']:
            nuevo, crudo = f['base_civa'], f['lista_base']
        elif ficha['unidad'] in PAQUETE:
            nuevo, crudo = f['civa'], f['lista_env']
        else:
            nuevo, crudo = (f['base_civa'] or f['civa']), (f['lista_base'] or f['lista_env'])
        actual = float(ficha['precio_ref'] or 0)
        dif = round((nuevo - actual) / actual * 100, 1) if actual and nuevo else None

        # ¿La ficha quedó cargada con el número CRUDO del comprobante? Es el error
        # de carga más caro y no se ve como error: el precio "existe" y parece
        # razonable, sólo que le falta el IVA, la bonificación, o las dos. Buscar
        # un +21% exacto no alcanza — con una bonificación del 2% la diferencia
        # baja a +18,6% y se escapa (Hierro plano 1/2", 14/09).
        # La tolerancia es del 0,1% y no más: el patrón es que alguien copió el
        # número TAL CUAL, así que tiene que ser el mismo número, no uno parecido.
        # Con 0,6% entraban dos fichas cuyo precio caía por casualidad a medio
        # punto del lista de otro renglón, y las dos eran falsas alarmas.
        es_crudo = bool(actual and crudo and nuevo
                        and abs(actual - crudo) / crudo < 0.001
                        and nuevo / actual > 1.02)

        # ¿hablan de la misma presentación? dos señales distintas
        ce, cf = cantidades(f['desc']), cantidades(ficha['nombre'])
        choque = sorted({u for u, _ in ce} & {u for u, _ in cf}
                        - {u for u, v in ce if any(u == u2 and abs(v - v2) < 0.01 for u2, v2 in cf)})
        pack = es_pack(f['desc'])
        motivo = None
        if choque:
            motivo = 'la medida del envase no coincide (' + ', '.join(choque) + ')'
        elif pack and not por_pieza and ficha['unidad'] in ('unid', 'un'):
            # sólo avisa si NO se pudo bajar a precio por pieza; si la planilla
            # declara el contenido de la caja, la comparación ya es correcta
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
            dif=dif, motivo=motivo, crudo=es_crudo))
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

    # Esto va PRIMERO y separado: no es un aumento a mirar, es un precio mal
    # cargado. Se le está facturando al cliente menos de lo que costó.
    crudas = [r for r in res if r.get('crudo')]
    if crudas:
        print(f"\n  ⚠ {len(crudas)} con el NÚMERO CRUDO DEL COMPROBANTE (le falta IVA "
              f"y/o la bonificación):")
        for r in sorted(crudas, key=lambda x: -(x['nuevo'] / x['actual'])):
            print(f"    #{r['ficha']:<5} {r['nombre'][:38]:38} ${r['actual']:>10,.2f} -> "
                  f"${r['nuevo']:>10,.2f}  (+{(r['nuevo'] / r['actual'] - 1) * 100:4.1f}%)  {r['prov']}")

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
