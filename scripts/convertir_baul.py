# -*- coding: utf-8 -*-
"""Convierte los Excel sucios de Baul_informativo/ en CSV limpios para datos_recolectada/.

Cada archivo viene con su propia rareza:
  - insumos:  CSV limpio en una sola columna.
  - hoteles:  5 celdas por fila; los servicios quedaron repartidos en columnas.
  - comercios: CSV con 'servicios' multilinea que parte cada registro en varias filas.

Salida: datos_recolectada/{comercio,turismo,agro}.csv con encabezados exactos.
Luego correr:  npm run importar
"""
import csv, io, os, re, openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAUL = os.path.join(RAIZ, "Baul_informativo")
SALIDA = os.path.join(RAIZ, "datos_recolectada")
os.makedirs(SALIDA, exist_ok=True)

def reparar(s):
    """Arregla la codificacion: doble UTF-8 (Ã­->i acentuada) y quita glifos basura."""
    if not s:
        return ""
    s = str(s)
    if "Ã" in s or "Â" in s:
        try:
            s = s.encode("latin-1", "ignore").decode("utf-8", "ignore")
        except UnicodeError:
            pass
    # quita caracteres de uso privado (iconos de mapa) y el de reemplazo
    s = "".join(ch for ch in s if not (0xE000 <= ord(ch) <= 0xF8FF) and ch != "�")
    return s.strip()

def limpiar(s):
    s = reparar(s)
    s = s.lstrip("·").strip().lstrip("-").strip()      # vinetas al inicio de servicios
    return s

def celdas_col_a(nombre_archivo):
    """Todas las celdas de la primera columna, en orden, incluidas vacias."""
    wb = openpyxl.load_workbook(os.path.join(BAUL, nombre_archivo), read_only=True)
    ws = wb.worksheets[0]
    return [(row[0] if row and row[0] is not None else "") for row in ws.iter_rows(values_only=True)]

def filas_completas(nombre_archivo):
    """Cada fila como lista de celdas (para hoteles, que reparte en columnas)."""
    wb = openpyxl.load_workbook(os.path.join(BAUL, nombre_archivo), read_only=True)
    ws = wb.worksheets[0]
    return [[("" if c is None else str(c)) for c in row] for row in ws.iter_rows(values_only=True)]

# ------------------------------------------------------------------ AGRO
def convertir_agro():
    celdas = celdas_col_a("insumos_agropecuarios_casanare_recoleccion_datos_reales.xlsx")
    texto = "\n".join(str(c) for c in celdas)
    lector = csv.reader(io.StringIO(texto))
    filas = [f for f in lector if any(x.strip() for x in f)]
    out = [["nombre", "latitud", "longitud", "servicios", "ciudad"]]
    for f in filas[1:]:
        if len(f) < 5:
            continue
        # si servicios trae comas, la fila tiene >5 campos: une el medio como servicios
        nombre, lat, lng = f[0], f[1], f[2]
        ciudad = f[-1]
        servicios = "; ".join(limpiar(x) for x in f[3:-1] if limpiar(x))
        out.append([limpiar(nombre), lat.strip(), lng.strip(), servicios, limpiar(ciudad)])
    escribir("agro.csv", out)
    return len(out) - 1

# ------------------------------------------------------------------ TURISMO (hoteles)
def convertir_turismo():
    filas = filas_completas("hoteles_casanare_recoleccion_datos_reales.xlsx")
    out = [["nombre", "categoria", "latitud", "longitud", "servicios", "ciudad"]]
    for fila in filas[1:]:
        # reconstruye la linea original uniendo las celdas y vuelve a separar
        linea = ",".join(c for c in fila if c is not None)
        partes = [p for p in linea.split(",")]
        if len(partes) < 6:
            continue
        nombre = limpiar(partes[0])
        categoria = limpiar(partes[1]) or "alojamiento"
        lat = partes[2].strip()
        lng = partes[3].strip()
        ciudad = limpiar(partes[-1])
        servicios = "; ".join(limpiar(p) for p in partes[4:-1] if limpiar(p))
        if not nombre:
            continue
        out.append([nombre, categoria.lower(), lat, lng, servicios, ciudad])
    escribir("turismo.csv", out)
    return len(out) - 1

# ------------------------------------------------------------------ COMERCIO
# El archivo de comercios trae el campo 'servicios' de Google Maps con comillas
# rotas y glifos de iconos, que fusionan registros. En vez de confiar en el CSV,
# extraemos cada negocio por regex anclado en sus DOS coordenadas decimales, que
# son inconfundibles. De cada negocio tomamos nombre, categoria, ciudad, lat, lng
# y la direccion siguiente. El 'servicios' basura se descarta (comercio funciona
# como directorio: la tienda se ve en el mapa con su categoria y direccion).
def convertir_comercio():
    celdas = celdas_col_a("comercios_casanare_recoleccion_de_datos.xlsx")
    texto = reparar("\n".join(str(c) for c in celdas))
    # nombre , categoria , ciudad , lat , lng , (direccion opcional entre comillas)
    patron = re.compile(
        r'(?:^|\n)\s*"?([^,\n"]{2,90})"?,'          # nombre
        r'\s*"?([^,\n"]{2,40})"?,'                    # categoria
        r'\s*"?([^,\n"]{2,40})"?,'                    # ciudad
        r'\s*(-?\d{1,2}\.\d{3,}),'                     # latitud
        r'\s*(-?\d{1,3}\.\d{3,})'                      # longitud
        r'(?:,\s*("(?:[^"]|"")*"|[^,\n]{0,120}))?'    # direccion opcional
    )
    out = [["nombre", "categoria", "ciudad", "latitud", "longitud",
            "direccion", "telefono", "sitio_web", "imagen_url", "servicios"]]
    vistos = set()
    for m in patron.finditer(texto):
        nombre, categoria, ciudad, lat, lng, direccion = m.groups()
        nombre = limpiar(nombre)
        clave = (nombre.lower(), lat, lng)
        if not nombre or clave in vistos:
            continue
        vistos.add(clave)
        direccion = limpiar((direccion or "").strip().strip('"'))
        out.append([
            nombre, limpiar(categoria).lower(), limpiar(ciudad), lat, lng,
            direccion, "", "", "", "",   # telefono/web/imagen/servicios: no confiables en esta fuente
        ])
    escribir("comercio.csv", out)
    return len(out) - 1

def escribir(nombre, filas):
    with open(os.path.join(SALIDA, nombre), "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(filas)

if __name__ == "__main__":
    a = convertir_agro()
    t = convertir_turismo()
    c = convertir_comercio()
    print(f"CSV generados en datos_recolectada/  ->  agro:{a}  turismo:{t}  comercio:{c} filas de datos")
    print("Ahora corre:  npm run importar")
