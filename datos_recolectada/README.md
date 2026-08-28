# datos_recolectada/

Aquí van los archivos de la data recolectada de cada sector. Deja cada archivo con
el nombre exacto y las columnas exactas de abajo. Al terminar, corre:

```bash
npm run importar
```

Ese comando valida fila por fila, DESCARTA lo incompleto o fuera de Casanare, y
genera `src/datos/generado.mjs`, que la app usa automáticamente en vez de la data
de ejemplo. Al final imprime un reporte: cuántas filas entraron, cuántas se
descartaron y por qué.

## Archivos y columnas esperadas

Formato CSV, primera fila con los encabezados. Si un campo trae comas (por
ejemplo la lista de servicios de comercio), enciérralo entre comillas dobles.

### `comercio.csv`
```
nombre,categoria,ciudad,latitud,longitud,direccion,telefono,sitio_web,imagen_url,servicios
```
Obligatorias para integrar: nombre, categoria, ciudad, latitud, longitud, servicios.
Opcionales: direccion, telefono, sitio_web, imagen_url.

### `turismo.csv`
```
nombre,categoria,latitud,longitud,servicios,ciudad
```
Todas obligatorias.

### `agro.csv`
```
nombre,latitud,longitud,servicios,ciudad
```
Todas obligatorias.

## Reglas de validación (por qué se descarta una fila)

- Falta alguna columna obligatoria del sector.
- Latitud o longitud no numéricas, o fuera de los límites de Casanare.
- La ciudad no corresponde a un municipio de Casanare.
- El campo servicios viene vacío.

## Lista de servicios

El campo `servicios` puede traer varios, separados por `;`, `|` o coma. Cada
servicio se convierte en un ítem vendible del negocio. Como la data no trae
precio, cada ítem queda "a convenir" y la solicitud se coordina con el negocio.

## Municipios válidos

Yopal, Aguazul, Villanueva, Tauramena, Monterrey, Paz de Ariporo, Trinidad,
Orocué, San Luis de Palenque, Pore, Nunchía, Maní, Sabanalarga, Támara, Hato Corozal.
