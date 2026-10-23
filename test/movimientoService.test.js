// Pruebas del almacén central (equivale a MovimientoServiceTest.java, adaptado a las reglas del informe EFSRT)
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, terminar, reiniciarBase, sql, como, SEDE, PROD } = require('./apoyo');

let jefe;
let asistente;

before(iniciar);
after(terminar);
beforeEach(async () => {
  await reiniciarBase();
  jefe = await como('jefe');
  asistente = await como('asistente');
});

const entrada = (lineas, obs = 'GR 001-123') => asistente.post('/api/movimientos/entrada', { observacion: obs, lineas });
const salida = (id_sede, lineas) => asistente.post('/api/movimientos/salida', { id_sede, lineas });
const stock = async (id) => (await sql('SELECT stock, stock_minimo FROM producto WHERE id_producto = ?', [id]))[0];
const contar = async (tabla) => (await sql(`SELECT COUNT(*) AS n FROM ${tabla}`))[0].n;

test('salida correcta descuenta el stock y guarda cabecera, detalle y saldo (RN-03, RN-06)', async () => {
  await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 500 }]);
  const r = await salida(SEDE.BARTON, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 200, cantidad: 200 }]);
  assert.equal(r.status, 201);
  assert.equal((await stock(PROD.BOLSA_ROJA)).stock, 300);
  const [m] = await sql("SELECT * FROM movimiento WHERE tipo = 'SALIDA'");
  assert.equal(m.id_sede, SEDE.BARTON);
  assert.equal(m.confirmado_sede, null);
  const [d] = await sql('SELECT * FROM detalle_movimiento WHERE id_movimiento = ?', [m.id_movimiento]);
  assert.equal(d.cantidad_pedida, 200);
  assert.equal(d.stock_resultante, 300);
});

test('salida sin stock suficiente no guarda nada y dice cuál producto falta (RN-04, RN-05)', async () => {
  await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 500 }, { id_producto: PROD.MASCARILLA, cantidad: 10 }]);
  const antes = await contar('movimiento');
  const r = await salida(SEDE.BARTON, [
    { id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 100, cantidad: 100 },
    { id_producto: PROD.MASCARILLA, cantidad_pedida: 50, cantidad: 50 },
  ]);
  assert.equal(r.status, 400);
  assert.match(r.datos.errores[0], /Stock insuficiente de EPP-001 Mascarilla KN95/);
  assert.equal(await contar('movimiento'), antes);
  assert.equal((await stock(PROD.BOLSA_ROJA)).stock, 500, 'la bolsa roja no se descontó: todo o nada');
});

test('despachar menos de lo pedido queda como entrega incompleta', async () => {
  await entrada([{ id_producto: PROD.GUANTES, cantidad: 10 }]);
  const r = await salida(SEDE.KAELIN, [{ id_producto: PROD.GUANTES, cantidad_pedida: 8, cantidad: 5 }]);
  assert.equal(r.status, 201);
  assert.match(r.datos.mensaje, /entrega incompleta/);
  const [d] = await sql('SELECT cantidad_pedida, cantidad FROM detalle_movimiento WHERE id_movimiento = ?', [r.datos.id_movimiento]);
  assert.deepEqual([d.cantidad_pedida, d.cantidad], [8, 5]);
});

test('la salida recalcula el stock mínimo: (salidas de 90 días ÷ 90) × días de reposición (RN-07)', async () => {
  await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 2000 }]);
  await salida(SEDE.BARTON, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 900, cantidad: 900 }]);
  // 900 / 90 × 7 días = 70
  assert.equal((await stock(PROD.BOLSA_ROJA)).stock_minimo, 70);
});

test('sin salidas en 90 días se usa el mínimo inicial (RN-02, RN-07)', async () => {
  await entrada([{ id_producto: PROD.BOLSA_NEGRA, cantidad: 100 }]);
  await salida(SEDE.BARTON, [{ id_producto: PROD.BOLSA_NEGRA, cantidad_pedida: 10, cantidad: 10 }]);
  // La salida se mueve a hace 120 días: ya no cuenta
  await sql("UPDATE movimiento SET fecha = NOW() - INTERVAL 120 DAY WHERE tipo = 'SALIDA'");
  await asistente.post('/api/movimientos/entrada', { lineas: [{ id_producto: PROD.BOLSA_NEGRA, cantidad: 1 }] });
  const editar = await jefe.put(`/api/productos/${PROD.BOLSA_NEGRA}`, {
    nombre: 'Bolsa negra 60x80', unidad: 'unidad', id_categoria: 1, id_marca: 1, dias_reposicion: 7, minimo_inicial: 80,
  });
  assert.equal(editar.status, 200);
  assert.equal((await stock(PROD.BOLSA_NEGRA)).stock_minimo, 80);
});

test('las salidas de hace más de 90 días no cuentan para el mínimo', async () => {
  await entrada([{ id_producto: PROD.MASCARILLA, cantidad: 2000 }]);
  await salida(SEDE.BARTON, [{ id_producto: PROD.MASCARILLA, cantidad_pedida: 900, cantidad: 900 }]);
  await sql("UPDATE movimiento SET fecha = NOW() - INTERVAL 100 DAY WHERE tipo = 'SALIDA'");
  await salida(SEDE.BARTON, [{ id_producto: PROD.MASCARILLA, cantidad_pedida: 180, cantidad: 180 }]);
  // Solo cuentan las 180 de hoy: 180 / 90 × 7 = 14
  assert.equal((await stock(PROD.MASCARILLA)).stock_minimo, 14);
});

test('la salida avisa qué productos quedaron por reponer y la consulta de stock los filtra (RN-08)', async () => {
  await entrada([{ id_producto: PROD.ALCOHOL, cantidad: 95 }, { id_producto: PROD.BOLSA_ROJA, cantidad: 500 }]);
  // mínimo = 90 / 90 × 7 = 7 y quedan 5: por reponer
  const r = await salida(SEDE.BARTON, [{ id_producto: PROD.ALCOHOL, cantidad_pedida: 90, cantidad: 90 }]);
  assert.deepEqual(r.datos.alertas.map((a) => a.codigo), ['LIM-001']);
  const stockR = await asistente.get('/api/stock?situacion=REPONER');
  assert.equal(stockR.status, 200, JSON.stringify(stockR.datos));
  const codigos = stockR.datos.productos.map((p) => p.codigo);
  assert.ok(codigos.includes('LIM-001') && !codigos.includes('BOL-001'));
  const todos = await asistente.get('/api/stock?categoria=Bolsas');
  assert.deepEqual(todos.datos.productos.map((p) => p.codigo).sort(), ['BOL-001', 'BOL-002']);
});

test('la base de datos impide el stock negativo aunque el servidor falle (RN-04)', async () => {
  await assert.rejects(sql('UPDATE producto SET stock = -1 WHERE id_producto = 1'), /ck_producto_stock/);
  await assert.rejects(sql("INSERT INTO movimiento (tipo, id_usuario) VALUES ('SALIDA', 2)"), /ck_mov_sede/);
});

test('la salida valida los datos del formulario', async () => {
  let r = await salida(null, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 1, cantidad: 1 }]);
  assert.ok(r.datos.errores.includes('Seleccione la sede de destino.'));
  r = await salida(SEDE.BARTON, []);
  assert.ok(r.datos.errores.includes('Agregue al menos un producto.'));
  r = await salida(SEDE.BARTON, [
    { id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 5, cantidad: 6 },
    { id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 1, cantidad: 1 },
  ]);
  assert.ok(r.datos.errores.some((e) => /más de lo pedido/.test(e)));
  assert.ok(r.datos.errores.some((e) => /repetido/.test(e)));
  await sql('UPDATE sede SET activo = 0 WHERE id_sede = ?', [SEDE.KAELIN]);
  await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 5 }]);
  r = await salida(SEDE.KAELIN, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 1, cantidad: 1 }]);
  assert.match(r.datos.errores[0], /desactivada/);
});

test('la entrada suma el stock de varios productos en un solo movimiento', async () => {
  const r = await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 100 }, { id_producto: PROD.GUANTES, cantidad: 12.5 }]);
  assert.equal(r.status, 201);
  assert.equal((await stock(PROD.BOLSA_ROJA)).stock, 100);
  assert.equal((await stock(PROD.GUANTES)).stock, 12.5);
  const [m] = await sql("SELECT id_sede, observacion FROM movimiento WHERE tipo = 'ENTRADA'");
  assert.deepEqual([m.id_sede, m.observacion], [null, 'GR 001-123']);
});

test('una entrada con cantidad 0 no guarda nada', async () => {
  const r = await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 100 }, { id_producto: PROD.GUANTES, cantidad: 0 }]);
  assert.equal(r.status, 400);
  assert.equal(await contar('movimiento'), 0);
  assert.equal((await stock(PROD.BOLSA_ROJA)).stock, 0);
});

test('la entrada de un producto desactivado es rechazada', async () => {
  await jefe.put(`/api/productos/${PROD.CHAQUETA}/estado`, { activo: false });
  const r = await entrada([{ id_producto: PROD.CHAQUETA, cantidad: 5 }]);
  assert.equal(r.status, 400);
  assert.match(r.datos.errores[0], /desactivado/);
});

test('el ajuste deja el stock igual al conteo físico y guarda la diferencia con su signo (HU-04)', async () => {
  await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 100 }]);
  let r = await jefe.post('/api/movimientos/ajuste', { id_producto: PROD.BOLSA_ROJA, cantidad_fisica: 92, motivo: 'Conteo mensual' });
  assert.equal(r.status, 201);
  assert.equal(r.datos.diferencia, -8);
  r = await jefe.post('/api/movimientos/ajuste', { id_producto: PROD.BOLSA_ROJA, cantidad_fisica: 95, motivo: 'Se encontró una caja' });
  assert.equal(r.datos.diferencia, 3);
  assert.equal((await stock(PROD.BOLSA_ROJA)).stock, 95);
  const ajustes = await sql("SELECT d.cantidad, m.observacion FROM movimiento m JOIN detalle_movimiento d USING (id_movimiento) WHERE m.tipo = 'AJUSTE' ORDER BY m.id_movimiento");
  assert.deepEqual(ajustes.map((a) => a.cantidad), [-8, 3]);
  assert.equal(ajustes[0].observacion, 'Conteo mensual');
});

test('si el conteo coincide no se registra ajuste; un conteo negativo es rechazado', async () => {
  await entrada([{ id_producto: PROD.GUANTES, cantidad: 7 }]);
  let r = await jefe.post('/api/movimientos/ajuste', { id_producto: PROD.GUANTES, cantidad_fisica: 7, motivo: 'Conteo' });
  assert.equal(r.status, 400);
  assert.match(r.datos.errores[0], /coincide/);
  r = await jefe.post('/api/movimientos/ajuste', { id_producto: PROD.GUANTES, cantidad_fisica: -1, motivo: 'Conteo' });
  assert.equal(r.status, 400);
  assert.equal((await sql("SELECT COUNT(*) AS n FROM movimiento WHERE tipo = 'AJUSTE'"))[0].n, 0);
});

test('el ajuste exige motivo y solo lo registra el jefe (RN-03)', async () => {
  let r = await jefe.post('/api/movimientos/ajuste', { id_producto: PROD.GUANTES, cantidad_fisica: 3, motivo: '  ' });
  assert.ok(r.datos.errores.includes('Ingrese el motivo del ajuste.'));
  r = await asistente.post('/api/movimientos/ajuste', { id_producto: PROD.GUANTES, cantidad_fisica: 3, motivo: 'x' });
  assert.equal(r.status, 403);
});

test('el kardex muestra los movimientos en orden con su saldo y el saldo inicial del periodo', async () => {
  await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 300 }]);
  await sql("UPDATE movimiento SET fecha = NOW() - INTERVAL 10 DAY");
  await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 200 }]);
  await salida(SEDE.BARTON, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 150, cantidad: 150 }]);
  await jefe.post('/api/movimientos/ajuste', { id_producto: PROD.BOLSA_ROJA, cantidad_fisica: 340, motivo: 'Conteo' });
  const hoy = (await sql("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d"))[0].d;
  const desde = (await sql("SELECT DATE_FORMAT(CURDATE() - INTERVAL 3 DAY, '%Y-%m-%d') AS d"))[0].d;
  const r = await asistente.get(`/api/kardex?producto=${PROD.BOLSA_ROJA}&desde=${desde}&hasta=${hoy}`);
  assert.equal(r.status, 200);
  assert.equal(r.datos.saldoInicial, 300);
  assert.deepEqual(r.datos.filas.map((f) => [f.tipo, f.cantidad, f.stock_resultante]),
    [['ENTRADA', 200, 500], ['SALIDA', 150, 350], ['AJUSTE', -10, 340]]);
  assert.equal(r.datos.filas[1].sede, 'Hospital Barton');
});

test('reportes: consumo por sede y mes, y productos bajo el mínimo (RF-08)', async () => {
  await entrada([{ id_producto: PROD.BOLSA_ROJA, cantidad: 1000 }, { id_producto: PROD.MASCARILLA, cantidad: 500 }]);
  await salida(SEDE.BARTON, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 300, cantidad: 300 }]);
  await salida(SEDE.BARTON, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 100, cantidad: 100 }]);
  await salida(SEDE.KAELIN, [{ id_producto: PROD.MASCARILLA, cantidad_pedida: 40, cantidad: 40 }]);
  const mes = (await sql("SELECT DATE_FORMAT(NOW(), '%Y-%m') AS m"))[0].m;
  let r = await jefe.get(`/api/reportes/consumo-sede-mes?mes=${mes}`);
  assert.equal(r.status, 200);
  assert.equal(r.datos.totales['Hospital Barton'], 400);
  assert.equal(r.datos.totales['Hospital Kaelin'], 40);
  r = await jefe.get('/api/reportes/bajo-minimo');
  const codigos = r.datos.productos.map((p) => p.codigo);
  assert.ok(codigos.includes('UNI-001') && !codigos.includes('BOL-001'));
  r = await asistente.get('/api/reportes/bajo-minimo');
  assert.equal(r.status, 403, 'los reportes son solo del jefe');
});
