# Vehículo IoT — Panel industrial

Frontend estático modular para GitHub Pages. Vercel se utiliza como entrada HTTPS para las rutas REST.

## Estructura

- `index.html`: estructura del panel.
- `css/styles.css`: tema industrial negro/grafito/amarillo.
- `js/config.js`: configuración del vehículo y URL de Vercel.
- `js/api.js`: cliente REST con timeout.
- `js/websocket.js`: cliente WSS con reconexión exponencial.
- `js/ui.js`: indicadores, notificaciones y registro de eventos.
- `js/main.js`: integración de controles, catálogo y demos.
- `vercel.json`: rewrites REST de Vercel hacia FastAPI.

## Antes de publicar

1. Despliega este proyecto en Vercel para activar los rewrites REST.
2. Copia el dominio asignado por Vercel.
3. Edita `js/config.js` y reemplaza `https://REEMPLAZA-ESTO.vercel.app` por el dominio real.
4. Publica el contenido del frontend en GitHub Pages.
5. Verifica que EC2 permita tráfico entrante desde el proxy y que CORS/origin estén configurados de forma segura.

## Contratos REST utilizados

- `GET /health`
- `GET /api/v1/comandos/vehiculo/1`
- `GET /api/v1/demos/vehiculo/1`
- `POST /api/v1/estado/vehiculos/1/movimiento` con `{"comando": <codigo>, "origen": "Frontend"}`
- `POST /api/v1/demos/{demo_id}/ejecutar`
- `POST /api/v1/demos/vehiculo/1/cancelar`

Códigos de comando recibidos del catálogo real: 1 avanzar, 2 retroceder, 3 izquierda, 4 derecha, 5 subir brazo, 6 bajar brazo, 7 abrir pala, 8 cerrar pala, 9 luz, 10 sonido, 11 detener.

## WebSocket — pendiente de puente WSS

El frontend espera `wss://TU-DOMINIO-VERCEL/api/ws/vehiculos/1`. El WebSocket upstream confirmado por el proyecto es `ws://54.198.67.99:8000/ws/vehiculos/1`.

Los rewrites REST de `vercel.json` conservan el prefijo `/api` y reenvían `/health` por separado. El rewrite HTTP de `vercel.json` **no configura por sí solo un puente WebSocket**. Para habilitar WSS se necesita desplegar una función/relay WebSocket compatible con el runtime y plan de Vercel, o configurar TLS/WSS directamente en el servidor FastAPI. Hasta entonces, el indicador WebSocket permanecerá desconectado y no se debe considerar que el puente está operativo.

## Indicadores

- API AWS: se comprueba mediante `GET /health`.
- WebSocket: se comprueba mediante el estado real de la conexión del navegador.
- RDS: se muestra “Sin verificar”. El endpoint `/health` no prueba por sí solo el estado de RDS y no se inventa una verificación.

## Seguridad y operación

- El frontend no contiene credenciales ni se conecta directamente a RDS.
- HTTPS del navegador a Vercel no cifra automáticamente el tramo Vercel→EC2, que en esta configuración utiliza HTTP.
- No publiques el servicio de control sin autenticación/autorización, validación de origen y reglas de red adecuadas.
- DETENER envía el código 11. No sustituye la cancelación de una demo.
- No se ha inferido telemetría de estado físico a partir de eventos WebSocket; solo se muestran los mensajes recibidos.
