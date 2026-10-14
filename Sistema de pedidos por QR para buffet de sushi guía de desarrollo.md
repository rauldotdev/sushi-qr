# Sistema de pedidos por QR para buffet de sushi: guía de desarrollo

Oct 14, 2026 · @Raul

## 1. Objetivo y alcance

El objetivo es una aplicación web de pedidos por QR para buffets de sushi que funcione siempre sobre HTTPS, responda rápido incluso con mala cobertura y evite los abusos típicos del buffet libre.

**Alcance del MVP (versión 1)**

- Cliente: escanea el QR de la mesa, ve la carta, pide por rondas y sigue el estado de su pedido.
- Cocina: pantalla con los pedidos entrantes, sus estados y avisos.
- Sala: el camarero abre y cierra mesas, activa la sesión y cancela líneas.
- Administrador: gestiona carta, tarifas, reglas y mesas.

**Fuera del MVP:** pagos online, programa de fidelidad, integración con TPV y app nativa.

**Ventajas frente a otros sistemas**

| Punto débil habitual | Qué hará este sistema |
| --- | --- |
| Conexión HTTP sin cifrar | HTTPS obligatorio, HSTS y redirección automática de 80 a 443 |
| Carta lenta en el móvil | Carta cacheada, respuestas comprimidas, imágenes optimizadas y PWA ligera |
| Pedidos duplicados con wifi inestable | Clave de idempotencia por pedido y reintentos seguros |
| Pedidos desde fuera del local con un QR fotografiado | La mesa la activa el camarero; el cliente recibe un token de sesión temporal |
| El cliente no sabe cómo va su pedido | Estado en tiempo real: en cola, en cocina, servido |
| Alérgenos poco visibles | Alérgenos en cada plato y filtro por alérgeno |
| Un solo idioma | Español e inglés desde el inicio |

## 2. Stack y arquitectura

La recomendación es un monolito modular en TypeScript: una sola API, una base de datos y un canal en tiempo real. Es lo más simple de probar y de desplegar, y rinde de sobra para un local o una cadena pequeña.

| Capa | Tecnología propuesta | Motivo |
| --- | --- | --- |
| API | Node.js + Fastify + TypeScript | Framework rápido con validación por esquema integrada |
| Base de datos | PostgreSQL | Transacciones fiables para pedidos y sesiones |
| Caché y límites | Redis | Caché de la carta, límites de peticiones y eventos entre procesos |
| Tiempo real | WebSocket (o SSE) | Estado del pedido al cliente y pedidos nuevos a cocina |
| Cliente | PWA con Vite + Preact o React | Paquete pequeño, instalable y usable con red lenta |
| Proxy y TLS | Caddy | Certificados Let's Encrypt automáticos, HTTP/2 y HTTP/3 |
| Contenedores | Docker Compose | Mismo entorno en local y en producción |
| Pruebas | Vitest, Playwright, k6 | Unitarias e integración, extremo a extremo y carga |

Es una propuesta: el IDE puede cambiar una pieza si cumple los presupuestos de rendimiento (sección 3) y las normas de seguridad (sección 4).

**Estructura de carpetas sugerida**

```text
/apps/api        API, módulos: tables, sessions, menu, orders, staff
/apps/web        PWA del cliente
/apps/kitchen    Pantalla de cocina y panel de sala
/packages/shared Tipos y esquemas compartidos
/infra           Docker Compose, Caddyfile, scripts
/tests           e2e y carga
```

## 3. Presupuesto de rendimiento

La API tiene que responder en menos de 200 ms en el percentil 95 para lecturas y en menos de 400 ms para crear un pedido. Son objetivos propuestos; el IDE debe medirlos con pruebas de carga y fallar la entrega si no se cumplen.

| Métrica | Objetivo | Cómo se mide |
| --- | --- | --- |
| GET carta (p95, servidor) | menos de 200 ms | k6 con 200 usuarios simultáneos |
| POST pedido (p95, servidor) | menos de 400 ms | k6 con 100 pedidos por segundo en ráfaga |
| Carga inicial del cliente (4G) | LCP menos de 2,5 s | Lighthouse en CI |
| JavaScript inicial | menos de 100 KB comprimido | Análisis del bundle en CI |
| Imágenes de platos | WebP o AVIF, menos de 60 KB cada una | Script de comprobación en CI |

**Reglas para conseguirlo**

1. La carta se lee de Redis, no de PostgreSQL, y se invalida solo cuando el administrador la edita.
2. Respuestas con ETag y `Cache-Control`; el cliente usa peticiones condicionales (304).
3. Compresión Brotli o gzip en el proxy.
4. HTTP/2 o HTTP/3 con conexión reutilizada; una sola llamada inicial devuelve sesión y carta.
5. Nada de N+1 en consultas: cada endpoint usa como mucho 3 consultas, con índices revisados con `EXPLAIN`.
6. Crear un pedido es una sola transacción corta; las notificaciones a cocina salen después, por Redis.
7. Paginación o límites en toda lista; ninguna respuesta supera 50 KB.
8. El cliente es una PWA con el *service worker* guardando carta e imágenes, de modo que la segunda visita no espera a la red.
9. Pool de conexiones a la base de datos dimensionado y con tiempo máximo de espera.

## 4. Seguridad y HTTPS obligatorio

Ningún endpoint, página ni WebSocket se sirve por HTTP: todo el tráfico va cifrado y el puerto 80 solo redirige.

**HTTPS y transporte**

- TLS 1.2 como mínimo, TLS 1.3 preferido, con certificados Let's Encrypt renovados automáticamente por Caddy.
- Redirección 301 de HTTP a HTTPS y cabecera HSTS (`max-age` de un año, `includeSubDomains`).
- WebSocket solo con `wss://`.
- Cookies con `Secure`, `HttpOnly` y `SameSite=Strict`.
- Prueba automática que falle si alguna URL del código o de la configuración empieza por `http://`.

**Protección de la mesa y de la sesión**

- El QR contiene un token aleatorio de al menos 128 bits, nunca un número de mesa predecible.
- Escanear el QR no basta para pedir: el camarero abre la sesión de la mesa y, al hacerlo, el cliente puede crear el token de sesión.
- El token de sesión caduca al cerrar la mesa o al superar el tiempo máximo del buffet.
- Cada pedido lleva una clave de idempotencia para que un reintento no genere un duplicado.

**Aplicación**

- Validación de toda entrada con esquemas (JSON Schema o Zod) y rechazo de campos desconocidos.
- Límite de peticiones por IP y por sesión (Redis).
- Cabeceras de seguridad: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- CORS limitado a los dominios propios.
- Personal con usuario y contraseña (hash con Argon2) y roles: sala, cocina, administrador.
- Consultas parametrizadas; nunca SQL concatenado.
- Secretos en variables de entorno, jamás en el repositorio; `npm audit` en CI.
- No se guardan datos personales del cliente; los registros no incluyen tokens.

## 5. Modelo de datos

La base de datos gira alrededor de la sesión de mesa: todo pedido pertenece a una sesión, y la sesión es la que lleva las reglas del buffet.

| Entidad | Campos principales | Notas |
| --- | --- | --- |
| restaurant | id, nombre, zona\_horaria, configuración | Una fila por local |
| table | id, restaurant\_id, número, qr\_token | `qr_token` único y aleatorio |
| tariff | id, nombre, precio, duración\_máx\_min, platos\_por\_ronda, pausa\_entre\_rondas\_s | Almuerzo, cena, niños |
| category | id, nombre (es/en), orden | Agrupa platos |
| dish | id, category\_id, nombre (es/en), imagen, alérgenos, límite\_por\_ronda, activo | Activo permite agotar un plato |
| tariff\_dish | tariff\_id, dish\_id | Qué platos incluye cada tarifa |
| table\_session | id, table\_id, tariff\_id, comensales, inicio, fin, estado, session\_token\_hash | Estados: abierta, cerrada, caducada |
| order\_round | id, session\_id, número, idempotency\_key, creado\_en, estado | Una ronda por pedido |
| order\_line | id, round\_id, dish\_id, cantidad, estado | Estados: en cola, en cocina, servido, cancelado |
| staff\_user | id, restaurant\_id, nombre, rol, password\_hash | Roles: sala, cocina, administrador |
| audit\_log | id, actor, acción, entidad, fecha | Cancelaciones y cierres de mesa |

**Reglas del modelo**

- Claves primarias UUID; fechas siempre en UTC.
- Restricción única en `(session_id, idempotency_key)` para impedir duplicados.
- Índices en `qr_token`, `session_id`, `(round_id, estado)` y `(restaurant_id, estado)`.
- Migraciones versionadas; ninguna se edita después de aplicada.
- Datos de ejemplo (*seed*) para que el IDE pueda ejecutar pruebas desde el primer día.

## 6. Endpoints de la API

Toda la API cuelga de `/api/v1`, devuelve JSON y errores con formato único (`code`, `message`). Cada endpoint tiene su esquema de entrada y salida y, como mínimo, una prueba de éxito y una de fallo.

| Método y ruta | Quién | Qué hace |
| --- | --- | --- |
| `GET /tables/{qr_token}` | Cliente | Dice si la mesa tiene sesión abierta; no devuelve datos sensibles |
| `POST /sessions/{qr_token}/join` | Cliente | Con la sesión abierta, devuelve el token de sesión y la carta de su tarifa |
| `GET /menu` | Cliente | Carta de la tarifa de la sesión, con ETag |
| `POST /orders` | Cliente | Crea una ronda; exige `Idempotency-Key` y aplica las reglas del buffet |
| `GET /orders` | Cliente | Rondas de la sesión y estado de cada línea |
| `GET /session/status` | Cliente | Tiempo restante, siguiente ronda disponible y platos por ronda |
| `POST /staff/login` | Personal | Inicia sesión y devuelve un token con rol |
| `POST /staff/tables/{id}/open` | Sala | Abre la sesión con tarifa y número de comensales |
| `POST /staff/tables/{id}/close` | Sala | Cierra la sesión e invalida su token |
| `PATCH /staff/order-lines/{id}` | Cocina, sala | Cambia el estado de una línea o la cancela |
| `GET /staff/orders?status=` | Cocina, sala | Lista de pedidos activos, con paginación |
| `CRUD /admin/dishes, /admin/tariffs, /admin/tables` | Administrador | Gestión de carta, tarifas y mesas |
| `GET /health` | Monitorización | Estado de API, base de datos y Redis |

**Tiempo real**

- Canal `wss://…/realtime`: el cliente recibe cambios de estado de sus líneas y cocina recibe pedidos nuevos.
- Si el canal cae, el cliente vuelve a consultar `GET /orders` cada pocos segundos hasta reconectar.

**Códigos de error principales**

- 400 entrada no válida · 401 sin sesión · 403 rol insuficiente · 404 mesa o plato inexistente.
- 409 sesión cerrada o pedido duplicado con distinto contenido.
- 422 regla del buffet incumplida (se indica cuál).
- 429 demasiadas peticiones.

## 7. Reglas de negocio del buffet

Cada regla vive en la configuración de la tarifa, no en el código, para que el local la cambie sin tocar nada. Los valores de la tabla son ejemplos iniciales.

| Regla | Ejemplo inicial | Resultado si se incumple |
| --- | --- | --- |
| Platos por persona y ronda | 8 | 422 `ROUND_LIMIT` |
| Pausa entre rondas | 10 minutos | 422 `ROUND_COOLDOWN`, con segundos restantes |
| Duración máxima de la sesión | 100 minutos | 409 `SESSION_EXPIRED` |
| Límite por plato y ronda | Según plato (por ejemplo, 2 por persona) | 422 `DISH_LIMIT` |
| Plato fuera de la tarifa | No permitido | 422 `DISH_NOT_IN_TARIFF` |
| Plato agotado | No permitido | 422 `DISH_UNAVAILABLE` |
| Una sola ronda abierta a la vez | Sí, hasta que cocina marque todo como servido | 422 `ROUND_PENDING` |

**Cálculo del límite:** el máximo de una ronda es `comensales × platos por persona`; los comensales se fijan al abrir la sesión y solo sala puede cambiarlos.

**Otras reglas**

- Cancelar una línea solo es posible mientras esté en cola; después, solo sala o cocina, y queda en `audit_log`.
- Al cerrar la mesa, la sesión pasa a cerrada y el token deja de valer al instante.
- Una sesión abierta que supera su duración máxima pasa a caducada con una tarea programada.
- El recargo por comida sobrante lo decide el personal fuera del sistema; en el MVP no se automatiza.
- Alérgenos: cada plato lleva sus alérgenos y el cliente puede ocultar los que no le convienen.

## 8. Plan de desarrollo por fases

Se construye en 9 fases cortas, y no se empieza una fase hasta que la anterior tiene todas sus pruebas en verde. Cada fase termina con un commit etiquetado (`fase-0`, `fase-1`…).

1. **Fase 0, preparación.** Monorepo, TypeScript en modo estricto, linter, Docker Compose con PostgreSQL, Redis y Caddy, migraciones, datos de ejemplo y CI.
   - Listo cuando: `docker compose up` levanta todo y CI ejecuta una prueba de humo en verde.
2. **Fase 1, HTTPS y salud.** Caddy con TLS (certificado local en desarrollo), redirección de HTTP a HTTPS, HSTS, cabeceras de seguridad y `GET /health`.
   - Listo cuando: una prueba confirma que HTTP redirige y otra falla si el código contiene una URL `http://`.
3. **Fase 2, personal y mesas.** Login con roles, CRUD de mesas con `qr_token`, apertura y cierre de sesión.
   - Listo cuando: un camarero abre una mesa, el cliente se une y al cerrar el token deja de valer.
4. **Fase 3, carta y tarifas.** CRUD de categorías, platos y tarifas; `GET /menu` con caché en Redis y ETag.
   - Listo cuando: la carta cumple el presupuesto de la sección 3 en la prueba de carga.
5. **Fase 4, pedidos y reglas.** `POST /orders` con idempotencia y todas las reglas de la sección 7.
   - Listo cuando: cada regla tiene su prueba y un reintento con la misma clave devuelve el mismo pedido.
6. **Fase 5, tiempo real y cocina.** Canal `wss`, pantalla de cocina y cambios de estado.
   - Listo cuando: un pedido nuevo aparece en cocina y el cambio de estado llega al cliente sin recargar.
7. **Fase 6, cliente PWA.** Flujo QR, carta, pedido y estado; español e inglés; filtro de alérgenos; *service worker*.
   - Listo cuando: el flujo completo pasa en Playwright con un móvil emulado y red lenta.
8. **Fase 7, rendimiento y endurecimiento.** Pruebas k6, Lighthouse en CI, revisión de seguridad y límites de peticiones.
   - Listo cuando: todos los objetivos de la sección 3 se cumplen y `npm audit` no marca fallos graves.
9. **Fase 8, despliegue.** Servidor de producción, dominio, certificado real, copias de seguridad y monitorización.
   - Listo cuando: la prueba de humo pasa contra el entorno real, solo por HTTPS.

## 9. Estrategia de pruebas

Las pruebas se escriben junto con el código de cada fase, no al final: ninguna funcionalidad se da por hecha sin ellas.

| Nivel | Herramienta | Qué cubre |
| --- | --- | --- |
| Unitarias | Vitest | Reglas del buffet, cálculo de límites, validadores |
| Integración | Vitest + Fastify `inject` + PostgreSQL y Redis reales en contenedor | Endpoints, transacciones, idempotencia, permisos por rol |
| Extremo a extremo | Playwright (móvil emulado) | Flujo completo: abrir mesa, unirse, pedir, ver estado |
| Carga | k6 | Presupuestos de rendimiento de la sección 3 |
| Seguridad | Pruebas propias + `npm audit` | HTTPS, cabeceras, tokens, límites de peticiones |
| Rendimiento del cliente | Lighthouse CI | LCP y tamaño del JavaScript |

**Pruebas obligatorias**

- Una petición por HTTP recibe 301 hacia HTTPS y la respuesta incluye HSTS.
- Un QR sin sesión abierta no permite pedir (403 o 409).
- Dos `POST /orders` con la misma clave devuelven el mismo pedido y no crean otro.
- Dos pedidos simultáneos que juntos superan el límite: solo uno se acepta.
- Una ronda antes de acabar la pausa devuelve 422 con los segundos restantes.
- Un token de otra sesión o de una sesión cerrada devuelve 401.
- Cada rol solo accede a lo suyo: cocina no abre mesas, sala no edita la carta.
- Respuestas con campos desconocidos o tipos erróneos devuelven 400.
- La carta devuelve 304 cuando no ha cambiado.

**Criterios de calidad**

- Cobertura mínima del 80 % en `apps/api`, y del 100 % en el módulo de reglas del buffet.
- La integración continua ejecuta unitarias, integración y seguridad en cada commit; extremo a extremo y carga en cada fase.

## 10. Normas de trabajo para el IDE y criterios de aceptación

Estas normas son instrucciones directas para el asistente del IDE: se aplican en todas las fases.

**Cómo trabajar**

1. Avanza fase por fase, en el orden de la sección 8, y no empieces la siguiente sin pruebas en verde.
2. Antes de escribir código de una fase, escribe sus pruebas (o al menos sus casos) a partir de las secciones 6 y 7.
3. Al terminar cada fase, ejecuta todas las pruebas, indica el resultado y espera mi confirmación antes de seguir.
4. Si algo es ambiguo o contradice este documento, pregunta en lugar de suponer.
5. No cambies el stack ni los presupuestos de rendimiento sin proponerlo antes y explicar el motivo.

**Normas de código**

- TypeScript en modo estricto, sin `any` salvo justificación en un comentario.
- Una responsabilidad por módulo; las reglas del buffet viven en un módulo propio, sin dependencias de HTTP.
- Todo endpoint con esquema de entrada y salida, y errores con el formato `code` + `message`.
- Nada de SQL concatenado ni de secretos en el repositorio; configuración por variables de entorno con un `.env.example`.
- Commits pequeños y con mensaje claro (`feat:`, `fix:`, `test:`, `chore:`).
- Registros en JSON, sin tokens ni contraseñas.
- Código y comentarios en inglés; textos visibles al usuario en español e inglés mediante archivos de traducción.

**Criterios de aceptación del MVP**

- [ ] Todo el tráfico va por HTTPS y el puerto 80 solo redirige.
- [ ] La carta responde en menos de 200 ms (p95) con 200 usuarios simultáneos.
- [ ] Crear un pedido responde en menos de 400 ms (p95) con 100 pedidos por segundo.
- [ ] Un reintento con la misma clave de idempotencia nunca duplica el pedido.
- [ ] Un QR fotografiado no permite pedir si la mesa no está abierta por el camarero.
- [ ] Todas las reglas de la sección 7 tienen prueba automática.
- [ ] El flujo completo pasa en Playwright con móvil emulado.
- [ ] Cobertura mínima del 80 % en la API y CI en verde.
- [ ] `npm audit` sin vulnerabilidades graves.
- [ ] Despliegue en producción con certificado real y prueba de humo en verde.
