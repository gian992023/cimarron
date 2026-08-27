# assets/

## Lo que falta poner aquí: el QR de Bre-B

Guarda aquí el QR de tu llave Bre-B con este nombre exacto:

```
assets/qr-breb.png
```

Es el QR estático de la llave, el mismo que al escanearse desde Nequi, Bancolombia
o cualquier banco lleva directo al pago de esa cuenta. No hay que integrarlo con
nada: es una imagen, y el agente la muestra junto al monto exacto y la referencia.

Después, en `.env`, ajusta estos tres valores:

```
BREB_LLAVE=@tu_llave
BREB_TITULAR=NOMBRE QUE VE EL COMPRADOR
BREB_QR_URL=/assets/qr-breb.png
```

Con eso, la herramienta `generar_pago_breb` del agente ya entrega la instrucción
de pago completa y la interfaz muestra el QR en el panel derecho.

## Por qué el flujo es así

Bre-B mueve la plata por llave, no por pasarela. Eso significa que no se necesita
comercio registrado, contrato con proveedor de pagos ni comisión por transacción.
Para un artesano o una cocinera de Yopal esa diferencia es la que decide si puede
o no vender en digital.

El agente cubre el resto: genera una **referencia única por pedido**, así el
negocio sabe qué transferencia corresponde a qué venta. Eso es lo que hoy no
existe cuando se cobra por transferencia informal.
