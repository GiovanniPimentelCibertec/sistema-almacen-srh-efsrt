# Lógica del Sistema de Almacén SRH (Node.js + MySQL)

2026-10-11 · Giovanni Pimentel

Esta es la lógica completa del sistema de almacén de SRH S.A.C. llevada al stack de EFSRT: HTML5 + CSS3 + JavaScript en la pantalla, JavaScript con Node.js en el servidor y MySQL. El script de la base de datos (bd_almacen_srh.sql) ya está probado y acompaña este documento.

## 1. Cómo se reparte la lógica

La regla de oro: **la pantalla ayuda, el servidor decide y la base de datos protege**. Nada importante se confía solo al JavaScript del navegador, porque cualquiera puede saltárselo.

| Capa | Tecnología | Qué hace | Responsable |
| --- | --- | --- | --- |
| Pantalla | HTML5 + CSS3 + JavaScript | Formularios, validaciones rápidas (campos vacíos, cantidad > 0), tablas y avisos | Díaz |
| Servidor | Node.js (Express + mysql2 + bcryptjs + express-session) | Login, permisos por rol, reglas de negocio, transacciones «todo o nada», reportes | Garay |
| Base de datos | MySQL (bd_almacen_srh) | Guarda los datos; claves únicas, claves foráneas y CHECK que impiden stock negativo; vistas para reportes | Pimentel |

Cada operación sigue el mismo camino:

1. El usuario llena un formulario y pulsa Guardar.
2. El JavaScript de la pantalla revisa lo básico y envía los datos al servidor con `fetch` (en JSON).
3. El servidor revisa la sesión y el rol; si no corresponde, responde «No tienes permiso».
4. El servidor valida las reglas de negocio y guarda todo en una sola transacción de MySQL.
5. El servidor responde con el resultado (o el error con un mensaje claro) y la pantalla lo muestra.

## 2. Roles y permisos

Cada usuario tiene un solo rol, guardado en `usuario.rol`. Al iniciar sesión, el servidor guarda en la sesión el id, el rol y (si es SEDE) su `id_sede`. Cada ruta del servidor revisa el rol antes de hacer nada.

| Función | ADMINISTRADOR | JEFE | ASISTENTE | SEDE |
| --- | --- | --- | --- | --- |
| Usuarios, sedes y categorías | Sí | — | — | — |
| Productos y marcas | — | Sí | Solo ver | — |
| Registrar entradas y salidas | — | Sí | Sí | — |
| Registrar ajustes del almacén | — | Sí | — | — |
| Kardex y stock | — | Sí | Sí | — |
| Reportes | — | Sí | — | — |
| Conteo y consumo de su sede | — | — | — | Sí |
| Confirmar envíos recibidos | — | — | — | Sí |
| Corregir o anular sus registros (≤ 24 h) | — | — | — | Sí |
| Aprobar correcciones y diferencias | — | Sí | — | — |
| Panel de sedes | — | Sí | — | — |

Dos reglas de seguridad:

- **El encargado de sede solo ve su sede.** El servidor nunca toma la sede del formulario: usa la `id_sede` de la sesión.
- **Contraseñas cifradas.** Se guardan con `bcrypt.hash(password, 10)` y se comparan con `bcrypt.compare`; nunca en texto plano. Un usuario inactivo (`activo = 0`) no puede entrar.

## 3. Base de datos (9 tablas)

La base `bd_almacen_srh` tiene 7 tablas del almacén central y 2 de las sedes. **Nada se borra:** los catálogos se desactivan (`activo = 0`) y los movimientos o consumos se anulan (`estado = 'ANULADO'`). El diagrama es la Figura 8 del informe.

| Tabla | Qué guarda | Campos clave | Restricciones importantes |
| --- | --- | --- | --- |
| sede | Planta y hospitales | nombre, tipo (PLANTA/HOSPITAL), fecha_inicio_control, activo | nombre único |
| usuario | Quién entra | nombres, username, password (hash), rol, id_sede, activo | username único; solo el rol SEDE lleva sede, y siempre la lleva |
| categoria | Grupo de productos | nombre, activo | nombre único |
| marca | Marca del producto | nombre, activo | nombre único |
| producto | Cada insumo y su stock central | codigo, nombre, unidad, id_categoria, id_marca, stock, stock_minimo, dias_reposicion, minimo_inicial, activo | código único; stock ≥ 0 |
| movimiento | Cabecera de entrada, salida o ajuste | tipo, fecha, observacion, id_usuario, id_sede, estado, confirmado_sede | la SALIDA lleva sede; ENTRADA y AJUSTE no |
| detalle_movimiento | Cada producto del movimiento (kardex) | id_movimiento, id_producto, cantidad_pedida, cantidad, stock_resultante | saldo ≥ 0; un producto una vez por movimiento |
| consumo_sede | Lo que pasa en cada hospital | id_sede, id_producto, id_usuario, tipo (INICIAL/CONSUMO/AJUSTE), cantidad, turno, motivo, estado | INICIAL y CONSUMO > 0; AJUSTE ≠ 0 |
| registro_error | Cada corrección, anulación o diferencia | id_consumo o id_movimiento, accion, valor_anterior, valor_nuevo, motivo, usuario que reporta y que revisa, fechas, estado | debe apuntar al menos a un consumo o a un movimiento |

El script crea también 6 vistas para los reportes (sección 8) y datos de prueba: las 3 sedes, 5 categorías, 6 productos y un usuario por rol (admin, jefe, asistente, barton, kaelin; contraseña de prueba `123456`). Se probó cargando el script y simulando una entrada, una salida a Barton y un consumo: el stock central, el kardex y el stock de la sede salieron correctos, y MySQL rechazó el stock negativo, el código duplicado y la salida sin sede.

## 4. Reglas de negocio

Son las mismas del informe (Tabla 3). La columna «Dónde se aplica» dice quién la hace cumplir; cuando dice «servidor + BD», la base de datos es la red de seguridad si el servidor falla.

| Código | Regla | Dónde se aplica |
| --- | --- | --- |
| RN-01 | Códigos de producto y usernames únicos | BD (UNIQUE); el servidor traduce el error a «Ese código ya existe» |
| RN-02 | Producto nuevo: stock 0 y stock_minimo = minimo_inicial | Servidor al crear el producto |
| RN-03 | ENTRADA suma, SALIDA resta (con sede), AJUSTE suma o resta (solo JEFE) | Servidor + BD (CHECK de sede en movimiento) |
| RN-04 | Stock nunca negativo | Servidor + BD (CHECK stock ≥ 0) |
| RN-05 | Todo o nada: cabecera + detalles + stock en una transacción | Servidor (BEGIN / COMMIT / ROLLBACK) |
| RN-06 | Cada detalle guarda el saldo después del movimiento | Servidor |
| RN-07 | Stock mínimo automático después de cada salida | Servidor (consulta de la sección 5) |
| RN-08 | Alerta «REPONER» si stock ≤ stock_minimo | BD (vista v_stock_actual) + pantalla |
| RN-09 | Stock de sede = INICIAL + envíos − CONSUMO ± AJUSTE | BD (vista v_stock_sede) |
| RN-10 | Nada se borra: desactivar o anular, y anotar en registro_error | Servidor (no existe ninguna ruta DELETE) |
| RN-11 | Correcciones ≤ 24 h directas; más de 24 h, las aprueba el JEFE | Servidor |

La fórmula del stock mínimo (RN-07):

```latex
\text{stock mínimo} = \frac{\text{unidades salidas en los últimos 90 días}}{90} \times \text{días de reposición}
```

Si el producto no tuvo salidas en esos 90 días, se usa su mínimo inicial.

## 5. Procesos del almacén central

Los tres procesos siguen el mismo patrón: el usuario arma el movimiento con uno o varios productos y el servidor lo guarda en **una sola transacción**. Si un producto falla, se hace ROLLBACK y no queda nada guardado.

**Registrar una entrada** (JEFE o ASISTENTE)

1. Pantalla: observación (n.° de guía de remisión) y una fila por producto con su cantidad (> 0).
2. Servidor: abre la transacción e inserta el `movimiento` tipo ENTRADA, sin sede.
3. Por cada producto: lee su stock con `FOR UPDATE`, suma la cantidad, actualiza `producto.stock` e inserta el detalle con `stock_resultante` = nuevo stock.
4. COMMIT y responde «Entrada registrada».

**Registrar una salida a una sede** (JEFE o ASISTENTE)

1. Pantalla: sede de destino (solo sedes activas) y, por producto, cantidad pedida y cantidad despachada (puede ser menor).
2. Servidor: inserta el `movimiento` tipo SALIDA con `id_sede` y `confirmado_sede` vacío.
3. Por cada producto: si el stock no alcanza, lanza el error «Stock insuficiente de X: hay N» y hace ROLLBACK. Si alcanza, resta, guarda el detalle con su saldo y recalcula el stock mínimo.
4. COMMIT. Si algún producto quedó en su mínimo o debajo, responde con la lista para mostrar la alerta de reposición.
5. Si la sede es un hospital, el envío queda pendiente de confirmar (aparece en la vista `v_envios_pendientes`).

**Registrar un ajuste** (solo JEFE)

1. Pantalla: producto, cantidad que hay físicamente y motivo.
2. Servidor: diferencia = cantidad física − stock guardado. Si es 0, no registra nada.
3. Inserta el `movimiento` AJUSTE (motivo en `observacion`) y un detalle con la diferencia (positiva o negativa); el stock queda igual a la cantidad física.

Ejemplo de la salida en Node.js con mysql2, probado contra la base de datos (una salida correcta y otra rechazada por falta de stock, que no dejó nada guardado):

```javascript
// items = [{ id_producto, cantidad_pedida, cantidad }]
async function registrarSalida(idUsuario, idSede, items, observacion) {
  const cn = await pool.getConnection();
  try {
    await cn.beginTransaction();                       // todo o nada (RN-05)
    const [mov] = await cn.query(
      "INSERT INTO movimiento (tipo, observacion, id_usuario, id_sede) VALUES ('SALIDA', ?, ?, ?)",
      [observacion, idUsuario, idSede]);
    const alertas = [];
    for (const it of items) {
      const [[p]] = await cn.query(
        'SELECT nombre, stock FROM producto WHERE id_producto = ? AND activo = 1 FOR UPDATE', [it.id_producto]);
      if (!p) throw new Error('Producto no encontrado o inactivo');
      if (it.cantidad <= 0) throw new Error(`Cantidad inválida en ${p.nombre}`);
      if (Number(p.stock) < it.cantidad)               // RN-04
        throw new Error(`Stock insuficiente de ${p.nombre}: hay ${p.stock}`);
      const saldo = Number(p.stock) - it.cantidad;
      await cn.query('UPDATE producto SET stock = ? WHERE id_producto = ?', [saldo, it.id_producto]);
      await cn.query(
        'INSERT INTO detalle_movimiento (id_movimiento, id_producto, cantidad_pedida, cantidad, stock_resultante) VALUES (?, ?, ?, ?, ?)',
        [mov.insertId, it.id_producto, it.cantidad_pedida, it.cantidad, saldo]);   // RN-06
      await recalcularMinimo(cn, it.id_producto);      // RN-07
      const [[q]] = await cn.query('SELECT stock, stock_minimo FROM producto WHERE id_producto = ?', [it.id_producto]);
      if (Number(q.stock) <= Number(q.stock_minimo)) alertas.push(p.nombre);   // RN-08
    }
    await cn.commit();
    return { ok: true, id_movimiento: mov.insertId, alertas };
  } catch (e) {
    await cn.rollback();                               // no se guarda nada
    return { ok: false, mensaje: e.message };
  } finally {
    cn.release();
  }
}

async function recalcularMinimo(cn, idProducto) {     // RN-07
  await cn.query(`
    UPDATE producto p SET p.stock_minimo = COALESCE(ROUND((
      SELECT SUM(d.cantidad) FROM detalle_movimiento d
      JOIN movimiento m ON m.id_movimiento = d.id_movimiento
      WHERE d.id_producto = p.id_producto AND m.tipo = 'SALIDA' AND m.estado = 'ACTIVO'
        AND m.fecha >= NOW() - INTERVAL 90 DAY) / 90 * p.dias_reposicion, 2), p.minimo_inicial)
    WHERE p.id_producto = ?`, [idProducto]);
}
```

La entrada y el ajuste usan la misma estructura: cambian el tipo, el signo de la cantidad y que no llevan sede.

## 6. Sedes hospitalarias

El stock de cada hospital **no se guarda**: se calcula con la vista `v_stock_sede` (RN-09). En todos estos procesos la sede sale de la sesión del encargado, nunca del formulario.

```latex
\text{stock de la sede} = \text{INICIAL} + \text{envíos activos desde fecha\_inicio\_control} - \text{CONSUMO} \pm \text{AJUSTE}
```

**Conteo inicial** (una sola vez)

1. El encargado cuenta lo que hay y lo registra por producto: filas en `consumo_sede` con tipo INICIAL.
2. El servidor llena `sede.fecha_inicio_control` con la fecha de hoy. Los envíos anteriores a esa fecha no cuentan.
3. Si la sede ya tiene fecha de inicio, el servidor no deja repetir el conteo inicial.

**Confirmar un envío**

1. Al entrar, el encargado ve los envíos pendientes de su sede (`v_envios_pendientes`) con sus productos y cantidades.
2. «Sí, llegó todo»: `confirmado_sede = 'CONFORME'`.
3. «No, llegó diferente»: ingresa cuánto llegó de cada producto. El servidor marca `confirmado_sede = 'DIFERENTE'` y, por cada producto que llegó distinto, crea un `registro_error` con acción DIFERENCIA, motivo ENVIO, valor anterior = enviado, valor nuevo = recibido y estado PENDIENTE para el jefe (el producto se anota en detalle; ver punto abierto 2 en la sección 11).

**Registrar consumo por turno**

1. Producto y cantidad usada (> 0).
2. El turno se propone según la hora: MAÑANA de 06:00 a 13:59, TARDE de 14:00 a 21:59 y NOCHE de 22:00 a 05:59 (horario a confirmar con la planta).
3. Si la cantidad supera el stock de la sede, no se guarda y se muestra cuánto hay.
4. Si el mismo producto con la misma cantidad se registró hace menos de 10 minutos, la pantalla pregunta «¿Es otro consumo?». Solo si confirma, se guarda.
5. Al guardar, responde cuánto queda en la sede.

**Conteo de verificación**

1. El encargado ingresa la cantidad física de un producto.
2. Si no coincide con el stock calculado, el servidor guarda un AJUSTE por la diferencia (positiva o negativa) con motivo «Conteo de verificación».

## 7. Control de errores

Ningún registro se borra ni se pone en 0: se corrige el mismo registro o se marca ANULADO, y cada cambio queda en `registro_error` con valor anterior, valor nuevo, motivo y quién lo hizo. Para saber si un registro tiene menos de 24 h, el servidor compara su `fecha` con `NOW() - INTERVAL 24 HOUR`.

| Situación | Quién la inicia | Qué hace el servidor | Estado del error |
| --- | --- | --- | --- |
| Cantidad mal escrita, registro de menos de 24 h | Encargado de sede | Cambia la cantidad en el mismo consumo | APROBADO |
| Registro duplicado, menos de 24 h | Encargado de sede | Marca el consumo ANULADO (deja de contar) | APROBADO |
| Cualquier corrección de más de 24 h | Encargado de sede | No cambia nada todavía | PENDIENTE |
| Corrección pendiente aprobada | Jefe | Aplica el cambio y recalcula, en una transacción; guarda quién revisó y cuándo | APROBADO |
| Corrección pendiente rechazada | Jefe | No cambia nada; guarda quién revisó y cuándo | RECHAZADO |
| Envío diferente: «se registró mal» | Jefe | Anula la salida original (el stock central recupera lo enviado) y registra una salida nueva con lo que de verdad se envió | APROBADO |
| Envío diferente: «se perdió en el camino» | Jefe | Registra un AJUSTE negativo en la sede por la diferencia; el almacén central no cambia | APROBADO |

Dos límites que el servidor revisa siempre, antes de aplicar cualquier cambio:

- Si el cambio dejaría el stock del almacén o de la sede en negativo, no se aplica y se explica por qué.
- Un envío cuyo material ya se consumió en la sede no se puede anular, porque dejaría el stock de la sede en negativo.

## 8. Consultas y reportes

Toda la información sale de los movimientos y consumos activos; los anulados no cuentan. Las vistas ya vienen en el script, así el servidor solo hace un `SELECT` con filtros. Los reportes se muestran en pantalla y se imprimen o guardan en PDF con `window.print()` y una hoja de estilos para impresión.

| Consulta o reporte | Filtros | Qué muestra | Fuente | Quién |
| --- | --- | --- | --- | --- |
| Inicio (panel) | — | Total de productos, sedes y movimientos; productos por reponer; últimos movimientos | COUNT sobre las tablas + v_bajo_minimo + v_kardex | Roles del almacén |
| Kardex de un producto | Producto, fechas | Cada movimiento con fecha, tipo, sede, cantidad y saldo | v_kardex | Jefe, asistente |
| Stock actual | Categoría | Stock, stock mínimo y situación OK o REPONER | v_stock_actual | Jefe, asistente |
| Historial de movimientos | Tipo, sede, fechas | Entradas, salidas y ajustes | v_kardex | Jefe, asistente |
| Panel de sedes | Sede | Stock de la sede, uso diario, días que alcanza; rojo si alcanza para 2 días o menos; aviso si no registra consumo en más de 12 h | v_stock_sede + consumos de los últimos 7 días | Jefe |
| Registro de errores | Sede, estado | Correcciones, anulaciones y diferencias con su motivo | registro_error | Jefe |
| Consumo por sede y mes | Mes, sede | Total despachado por producto y sede, con totales | v_despacho_sede_mes | Jefe |
| Productos bajo el mínimo | — | Productos con stock ≤ mínimo y cuánto falta | v_bajo_minimo | Jefe |

En el panel de sedes: **uso diario** = consumo de los últimos 7 días ÷ 7, y **días que alcanza** = stock de la sede ÷ uso diario (si no hubo consumo, se muestra «sin consumo»).

## 9. Rutas del servidor (Node.js)

El servidor es una aplicación Express que entrega las pantallas (carpeta `public/`) y responde rutas `/api/...` en JSON. Un middleware `permitir('JEFE', 'ASISTENTE')` revisa la sesión y el rol antes de cada ruta; si falla, responde 403 «No tienes permiso». No hay rutas DELETE: desactivar y anular son PUT.

| Método y ruta | Qué hace | Roles |
| --- | --- | --- |
| POST /api/login | Valida usuario y contraseña (bcrypt) y crea la sesión | Todos |
| POST /api/logout | Cierra la sesión | Todos |
| GET /api/me | Devuelve nombre, rol y sede para armar el menú | Todos |
| GET, POST, PUT /api/usuarios | Listar, crear, editar y activar o desactivar usuarios | ADMINISTRADOR |
| GET, POST, PUT /api/sedes | Listar, crear, editar y activar o desactivar sedes | ADMINISTRADOR (GET: también JEFE y ASISTENTE) |
| GET, POST, PUT /api/categorias | Catálogo de categorías | ADMINISTRADOR (GET: también JEFE y ASISTENTE) |
| GET, POST, PUT /api/marcas | Catálogo de marcas | JEFE (GET: también ASISTENTE) |
| GET, POST, PUT /api/productos | Catálogo de productos | JEFE (GET: también ASISTENTE) |
| POST /api/movimientos/entrada | Registra una entrada con varios productos | JEFE, ASISTENTE |
| POST /api/movimientos/salida | Registra una salida a una sede | JEFE, ASISTENTE |
| POST /api/movimientos/ajuste | Registra un ajuste por conteo físico | JEFE |
| GET /api/kardex?producto=&desde=&hasta= | Kardex de un producto | JEFE, ASISTENTE |
| GET /api/stock?categoria= | Stock actual con situación | JEFE, ASISTENTE |
| GET /api/movimientos?tipo=&sede=&desde=&hasta= | Historial de movimientos | JEFE, ASISTENTE |
| GET /api/panel | Datos del panel de inicio | JEFE, ASISTENTE, ADMINISTRADOR |
| GET /api/sede/envios-pendientes | Envíos pendientes de su sede | SEDE |
| PUT /api/sede/envios/:id/confirmar | Marca CONFORME o DIFERENTE (con lo recibido) | SEDE |
| POST /api/sede/conteo-inicial | Conteo inicial de su sede | SEDE |
| POST /api/sede/consumo | Consumo por turno | SEDE |
| POST /api/sede/verificacion | Conteo de verificación | SEDE |
| GET /api/sede/stock | Stock calculado de su sede | SEDE |
| PUT /api/sede/consumos/:id/corregir | Corregir o anular un registro (regla de 24 h) | SEDE |
| GET /api/errores?sede=&estado= | Registro de errores | JEFE |
| PUT /api/errores/:id/aprobar y /rechazar | Revisar correcciones y diferencias | JEFE |
| GET /api/panel-sedes?sede= | Panel de sedes | JEFE |
| GET /api/reportes/consumo-sede-mes?mes=&sede= | Reporte de consumo por sede y mes | JEFE |
| GET /api/reportes/bajo-minimo | Reporte de productos bajo el mínimo | JEFE |

Estructura sugerida de carpetas: `server.js` (arranque), `db.js` (pool de mysql2), `middleware/auth.js` (sesión y roles), `routes/` (un archivo por módulo) y `public/` (HTML, CSS y JS de las pantallas).

## 10. Pantallas por rol

Una sola pantalla de login para todos; después, el menú se arma con el rol que devuelve `GET /api/me`. Ocultar opciones en el menú es comodidad: el bloqueo real lo hace el servidor.

| Rol | Pantallas |
| --- | --- |
| Todos | Login · Inicio (panel) · Cerrar sesión |
| ADMINISTRADOR | Usuarios · Sedes · Categorías |
| JEFE | Productos · Marcas · Entrada · Salida a sede · Ajuste · Kardex · Stock actual · Historial · Panel de sedes · Registro de errores (aprobar o rechazar) · Reportes |
| ASISTENTE | Productos (solo ver) · Entrada · Salida a sede · Kardex · Stock actual · Historial |
| SEDE | Envíos por confirmar · Conteo inicial · Registrar consumo · Conteo de verificación · Stock de mi sede · Mis registros (corregir o anular) |

Las pantallas de entrada y salida llevan una tabla donde se agregan filas de productos (botón «+ Agregar producto») y un solo botón Guardar. Las pantallas de sede deben verse bien en celular, porque el encargado las usará desde el hospital.

## 11. Puntos abiertos para el equipo

Al probar la lógica aparecieron dos huecos que conviene decidir antes de programar, y tres detalles por confirmar.

1. **Stock mínimo muy bajo al inicio.** Con pocas salidas, la fórmula da mínimos pequeños: en la prueba, la bolsa roja (mínimo inicial 10) quedó con mínimo 1,17 después de una sola salida, así que no avisaría a tiempo. Propuesta: usar el mayor entre la fórmula y el mínimo inicial (`GREATEST(fórmula, minimo_inicial)`), o usar la fórmula solo cuando el sistema ya tenga 90 días de datos.
2. **registro_error no sabe de qué producto es una diferencia de envío.** Un envío puede llevar varios productos, pero la tabla solo apunta al movimiento. Propuesta: agregar el campo `id_producto` (opcional) a registro_error; siguen siendo 9 tablas y solo cambia un campo en la Figura 8. Mientras tanto, el producto se anota en `detalle`.
3. **Horario de turnos.** Confirmar con la planta las horas de MAÑANA, TARDE y NOCHE (aquí se asumió 06:00, 14:00 y 22:00).
4. **Acceso real desde los hospitales.** En la etapa 1 el servidor está en una PC de la planta, así que las pantallas de sede se prueban en la planta con los usuarios barton y kaelin. El uso desde los hospitales llega con la etapa 2 (nube).
5. **Contraseñas de prueba.** `123456` es solo para pruebas; antes de usar el sistema con datos reales, cada usuario debe tener su propia contraseña.