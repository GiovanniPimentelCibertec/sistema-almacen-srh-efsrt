# Sistema web de gestión de almacén logístico – SRH S.A.C.

Aplicación web para controlar el almacén central de SRH S.A.C. (Planta Callao) y el consumo de sus sedes hospitalarias (Hospital Barton y Hospital Kaelin).

Proyecto del curso Experiencias Formativas en Situaciones Reales de Trabajo I (EFSRT I, Cibertec, Grupo 08).
HTML5 + CSS3 + JavaScript · Node.js (Express, express-session, bcryptjs) · MySQL 8 (mysql2) · pruebas con `node:test`

Tiene la misma estructura que la versión en Java (Spring Boot) del curso Lenguaje de Programación II, pero está hecha con el stack de EFSRT. Donde los dos proyectos se diferencian, sigue el informe EFSRT del Avance 2 y el documento de lógica ([docs/logica_sistema.md](docs/logica_sistema.md)).

## Funcionalidades

| Rol | Qué puede hacer |
|---|---|
| ADMINISTRADOR | Usuarios, sedes y categorías |
| JEFE | Productos y marcas, entradas, salidas, ajustes, kardex, stock, historial, panel de sedes, registro de errores (aprobar o rechazar) y reportes |
| ASISTENTE | Ver productos, registrar entradas y salidas, kardex, stock e historial |
| SEDE | Encargado de un hospital: conteo inicial, confirmar envíos, consumo por turno, conteo de verificación, stock de su sede y corregir o anular sus registros |

- **Salida a sedes (caso transaccional):** lleva varios productos, con lo pedido y lo despachado. Si a un producto no le alcanza el stock, no se guarda nada (RN-04, RN-05). Para eso se usa una transacción de MySQL (`BEGIN`/`COMMIT`/`ROLLBACK`) con `SELECT … FOR UPDATE`. Si se despacha menos de lo pedido, queda como entrega incompleta.
- **Ajustes:** solo los registra el jefe. Ingresa la cantidad contada físicamente y el motivo, el sistema guarda la diferencia y el stock queda igual al conteo (HU-04).
- **Stock mínimo:** se calcula como (salidas de los últimos 90 días ÷ 90) × días de reposición y se recalcula con cada salida. Si no hubo salidas, se usa el mínimo inicial (RN-07). La alerta «REPONER» aparece cuando el stock es menor o igual al mínimo (RN-08).
- **Consultas:** kardex por producto y rango de fechas, con el saldo con el que empieza el periodo; stock actual con filtros; historial de movimientos.
- **Reportes:** consumo por sede y mes, y productos bajo el mínimo. Se muestran en pantalla y se imprimen o guardan en PDF con el botón «Imprimir».
- **Sedes hospitalarias:**
  - **Stock:** se calcula como conteo inicial + envíos − consumos ± ajustes (RN-09).
  - **Envíos:** el encargado confirma cada envío. Si llegó diferente, queda pendiente para el jefe, que decide si **se registró mal** (se anula la salida y se registra otra con lo que de verdad se envió) o si **se perdió en el camino** (ajuste negativo en la sede).
  - **Consumo:** se registra por turno, y si se repite el mismo consumo en menos de 10 minutos, el sistema pregunta «¿Es otro consumo?».
- **Regla de 24 horas (RN-11):** el encargado corrige o anula sus registros de menos de 24 horas al momento. Los más antiguos los aprueba el jefe.
- **Nada se borra (RN-10):**
  - **Catálogos:** usuarios, sedes, categorías, marcas y productos se desactivan.
  - **Registros:** los movimientos y consumos se anulan, y cada cambio queda en `registro_error`.
  - **Sin borrado en la API:** no existe ninguna ruta DELETE.

## Estructura del proyecto (equivalencia con el proyecto Java)

| Carpeta / archivo | Contenido | En el proyecto Java |
|---|---|---|
| `package.json` | Dependencias y comandos | `pom.xml` |
| `.env.example` | Datos de conexión a MySQL (se copia como `.env`) | `application.properties` |
| `src/app.js` | Arranque del servidor Express | `SistemaAlmacenApplication.java` |
| `src/config/` | `db.js` (conexión y transacciones), `seguridad.js` (sesión y roles), `paginas.js` (pantallas por rol) | `config/` (`SecurityConfig`, `FormularioConfig`) |
| `src/routes/` | Rutas `/api/...` en JSON, una por módulo | `controller/` |
| `src/services/` | Reglas de negocio | `service/` |
| `src/repositories/` | Consultas SQL de cada tabla | `repository/` |
| `src/models/` | Las 9 entidades | `entity/` |
| `src/validators/` | Formularios (`movimientoForm`, `ajusteForm`, `stockSedeFila`) | `dto/` |
| `public/` | Pantallas HTML5 + CSS3 + JavaScript, en las mismas carpetas que las plantillas | `templates/` y `static/` |
| `test/` | Pruebas automáticas | `src/test` |
| `database/bd_almacen_srh.sql` | Script de las 9 tablas, las 6 vistas y los datos iniciales | `database/` |
| `database/cargar_datos_demo.js` | 30 días de datos simulados (opcional) | datos de prueba del script |
| `docs/logica_sistema.md` | Documento de lógica del sistema (roles, reglas, procesos y rutas) | — |

## Cómo ejecutarlo

Necesitas Node.js 18 o superior y MySQL 8.

1. **Base de datos:** abre `database/bd_almacen_srh.sql` en MySQL Workbench y ejecútalo completo con Ctrl+Shift+Enter. Crea la base `bd_almacen_srh`, con sus 9 tablas, 6 vistas y los datos iniciales.
2. **Configuración:** copia `.env.example` como `.env` y escribe tu contraseña de MySQL en `DB_PASSWORD`. El archivo `.env` es local y no se sube a GitHub.
3. **Dependencias:** en la carpeta del proyecto ejecuta:
   ```
   npm install
   ```
4. **Datos de demostración (opcional):** cargan 30 días de entradas, envíos, conteos y consumos. Solo funcionan sobre la base recién creada.
   ```
   npm run demo
   ```
5. **Ejecutar:**
   ```
   npm start
   ```
6. Abre http://localhost:3000

**Usuarios de prueba** (contraseña `123456`):
- `admin`: ADMINISTRADOR
- `jefe`: JEFE
- `asistente`: ASISTENTE
- `barton` y `kaelin`: SEDE

Al entrar por primera vez, cada encargado de sede registra su conteo inicial.

**Pruebas automáticas:** se ejecutan con `npm test`. Son 36 pruebas:
- 17 del almacén central;
- 13 de las sedes hospitalarias;
- 6 de sesión, roles y catálogos.

Crean y usan una base aparte, `bd_almacen_srh_test`, con los datos de conexión del `.env`.

## Base de datos (9 tablas y 6 vistas)

- **Almacén central:** `usuario`, `sede`, `categoria`, `marca`, `producto`, `movimiento`, `detalle_movimiento`.
- **Sedes hospitalarias:** `consumo_sede`, `registro_error`.
- **Vistas:** `v_stock_actual`, `v_kardex`, `v_stock_sede`, `v_envios_pendientes`, `v_despacho_sede_mes`, `v_bajo_minimo`.

## Diferencias con la versión Java (se sigue el informe EFSRT)

| Punto | Versión Java (LPII) | Esta versión (EFSRT) |
|---|---|---|
| Conteo en la sede | El hospital empieza en 0 automáticamente | Conteo inicial y conteo de verificación del encargado |
| Correcciones de la sede | No existen | Corregir o anular con la regla de 24 horas (RN-11) |
| Consumo repetido | Sin aviso | Pregunta «¿Es otro consumo?» si se repite en menos de 10 minutos |
| Envío que llega diferente | Se descuenta al confirmar y el jefe solo lo cierra | El jefe decide: «se registró mal» o «se perdió en el camino» |
| Ajuste | Cantidad a sumar o restar | Cantidad contada físicamente; el sistema calcula la diferencia |
| Stock mínimo | Divide entre los días de historia (hasta 90) | Divide entre 90, como dice la RN-07 |
| Categorías y marcas | Se eliminan si ningún producto las usa | Se desactivan; nada se borra |
| Reportes | PDF con JasperReports | En pantalla, imprimibles o en PDF desde el navegador |
| Tabla de detalle | `movimiento_detalle` | `detalle_movimiento`, con vistas para stock, kardex y reportes |

## Puntos abiertos (sección 11 del documento de lógica)

1. **Stock mínimo bajo al inicio:** con pocas salidas, la fórmula de la RN-07 da mínimos pequeños. Por ejemplo, 3 unidades en 90 días dan un mínimo de 0,23. El sistema aplica la regla tal como está en el informe. Si el equipo decide usar el mayor entre la fórmula y el mínimo inicial, el cambio se hace en un solo lugar: `recalcularMinimo` de `src/repositories/productoRepository.js`.
2. **Producto de una diferencia de envío:** `registro_error` no tiene columna de producto, así que el detalle empieza con el código del producto (por ejemplo `BOL-001 …`). Por eso el código de un producto no se puede cambiar después de creado.
3. **Horario de turnos:**
   - MAÑANA: de 06:00 a 13:59.
   - TARDE: de 14:00 a 21:59.
   - NOCHE: de 22:00 a 05:59.

   Falta confirmarlo con la planta.
4. **Contraseñas de prueba:** `123456` es solo para pruebas.
