// Pruebas de las sedes hospitalarias (equivale a HospitalServiceTest.java, con las reglas del informe EFSRT:
// conteo inicial, verificación, aviso de duplicado, regla de 24 horas y resolución de diferencias por el jefe)
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, terminar, reiniciarBase, sql, como, SEDE, PROD } = require('./apoyo');
const { turnoPara } = require('../src/services/hospitalService');

let jefe;
let asistente;
let barton;
let kaelin;

before(iniciar);
after(terminar);
beforeEach(async () => {
  await reiniciarBase();
  [jefe, asistente, barton, kaelin] = await Promise.all(['jefe', 'asistente', 'barton', 'kaelin'].map(como));
  await asistente.post('/api/movimientos/entrada', {
    lineas: [{ id_producto: PROD.BOLSA_ROJA, cantidad: 1000 }, { id_producto: PROD.MASCARILLA, cantidad: 300 }],
  });
});

const enviar = async (id_sede, lineas) =>
  (await asistente.post('/api/movimientos/salida', { id_sede, lineas })).datos.id_movimiento;
const stockSede = async (cli, id) => (await cli.get('/api/sede/stock')).datos.stock.find((f) => f.id_producto === id).stock_sede;
const conteoInicial = (cli, items = []) => cli.post('/api/sede/conteo-inicial', { items });

test('flujo completo: conteo inicial, envío, confirmación y consumo por turno (RN-09)', async () => {
  await conteoInicial(barton, [{ id_producto: PROD.BOLSA_ROJA, cantidad: 20 }]);
  const id = await enviar(SEDE.BARTON, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 100, cantidad: 100 }]);
  let r = await barton.get('/api/sede/envios-pendientes');
  assert.deepEqual(r.datos.envios.map((e) => e.id_movimiento), [id]);
  r = await barton.put(`/api/sede/envios/${id}/confirmar`, { conforme: true });
  assert.equal(r.datos.conforme, true);
  r = await barton.post('/api/sede/consumo', { id_producto: PROD.BOLSA_ROJA, cantidad: 35, turno: 'MAÑANA' });
  assert.equal(r.status, 201);
  assert.equal(r.datos.queda, 85);
  assert.equal(await stockSede(barton, PROD.BOLSA_ROJA), 85); // 20 inicial + 100 enviado − 35
  assert.equal((await barton.get('/api/sede/envios-pendientes')).datos.envios.length, 0);
});

test('no se puede consumir más de lo que hay en la sede', async () => {
  await conteoInicial(barton, [{ id_producto: PROD.MASCARILLA, cantidad: 10 }]);
  const r = await barton.post('/api/sede/consumo', { id_producto: PROD.MASCARILLA, cantidad: 11 });
  assert.equal(r.status, 400);
  assert.match(r.datos.errores[0], /solo hay 10/);
  assert.equal((await sql("SELECT COUNT(*) AS n FROM consumo_sede WHERE tipo = 'CONSUMO'"))[0].n, 0);
});

test('el conteo inicial se hace una sola vez y los envíos anteriores no cuentan', async () => {
  const anterior = await enviar(SEDE.BARTON, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 50, cantidad: 50 }]);
  await sql('UPDATE movimiento SET fecha = NOW() - INTERVAL 3 DAY WHERE id_movimiento = ?', [anterior]);
  // Sin conteo inicial, la sede no puede registrar consumo
  let r = await barton.post('/api/sede/consumo', { id_producto: PROD.BOLSA_ROJA, cantidad: 1 });
  assert.equal(r.status, 409);
  r = await conteoInicial(barton, [{ id_producto: PROD.BOLSA_ROJA, cantidad: 30 }]);
  assert.equal(r.status, 201);
  assert.equal(await stockSede(barton, PROD.BOLSA_ROJA), 30, 'el envío de hace 3 días no cuenta');
  assert.equal((await barton.get('/api/sede/envios-pendientes')).datos.envios.length, 0);
  r = await conteoInicial(barton, [{ id_producto: PROD.BOLSA_ROJA, cantidad: 99 }]);
  assert.equal(r.status, 409);
});

test('un envío que llega diferente queda pendiente para el jefe, un registro por producto (HU-05)', async () => {
  await conteoInicial(kaelin);
  const id = await enviar(SEDE.KAELIN, [
    { id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 100, cantidad: 100 },
    { id_producto: PROD.MASCARILLA, cantidad_pedida: 50, cantidad: 50 },
  ]);
  const r = await kaelin.put(`/api/sede/envios/${id}/confirmar`, { recibidos: { [PROD.BOLSA_ROJA]: 80, [PROD.MASCARILLA]: 50 } });
  assert.equal(r.datos.conforme, false);
  const errores = await sql('SELECT * FROM registro_error');
  assert.equal(errores.length, 1);
  assert.deepEqual([errores[0].accion, errores[0].motivo, errores[0].estado], ['DIFERENCIA', 'ENVIO', 'PENDIENTE']);
  assert.deepEqual([errores[0].valor_anterior, errores[0].valor_nuevo], [100, 80]);
  assert.match(errores[0].detalle, /^BOL-001 /);
  assert.equal((await sql('SELECT confirmado_sede FROM movimiento WHERE id_movimiento = ?', [id]))[0].confirmado_sede, 'DIFERENTE');
  const rep = await kaelin.put(`/api/sede/envios/${id}/confirmar`, { conforme: true });
  assert.equal(rep.status, 409, 'no se confirma dos veces');
});

test('el jefe resuelve una diferencia: «se perdió en el camino» descuenta en la sede', async () => {
  await conteoInicial(kaelin);
  const id = await enviar(SEDE.KAELIN, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 100, cantidad: 100 }]);
  await kaelin.put(`/api/sede/envios/${id}/confirmar`, { recibidos: { [PROD.BOLSA_ROJA]: 90 } });
  const [e] = await sql('SELECT id_error FROM registro_error');
  let r = await jefe.put(`/api/errores/${e.id_error}/aprobar`, {});
  assert.equal(r.status, 400, 'debe elegir qué pasó con el envío');
  r = await jefe.put(`/api/errores/${e.id_error}/aprobar`, { resolucion: 'PERDIDA' });
  assert.equal(r.status, 200);
  assert.equal(await stockSede(kaelin, PROD.BOLSA_ROJA), 90);
  assert.equal((await sql('SELECT stock FROM producto WHERE id_producto = 1'))[0].stock, 900, 'el almacén central no cambia');
  const [cerrado] = await sql('SELECT estado, id_usuario_revisa, fecha_revision FROM registro_error');
  assert.equal(cerrado.estado, 'APROBADO');
  assert.equal(cerrado.id_usuario_revisa, 2);
  assert.ok(cerrado.fecha_revision);
});

test('el jefe resuelve una diferencia: «se registró mal» anula la salida y registra lo que de verdad se envió', async () => {
  await conteoInicial(kaelin);
  const id = await enviar(SEDE.KAELIN, [
    { id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 100, cantidad: 100 },
    { id_producto: PROD.MASCARILLA, cantidad_pedida: 50, cantidad: 50 },
  ]);
  await kaelin.put(`/api/sede/envios/${id}/confirmar`, { recibidos: { [PROD.BOLSA_ROJA]: 70, [PROD.MASCARILLA]: 40 } });
  const [e] = await sql('SELECT id_error FROM registro_error ORDER BY id_error LIMIT 1');
  const r = await jefe.put(`/api/errores/${e.id_error}/aprobar`, { resolucion: 'REGISTRO' });
  assert.equal(r.status, 200, JSON.stringify(r.datos));
  assert.equal((await sql('SELECT estado FROM movimiento WHERE id_movimiento = ?', [id]))[0].estado, 'ANULADO');
  assert.equal((await sql('SELECT stock FROM producto WHERE id_producto = 1'))[0].stock, 930);
  assert.equal((await sql('SELECT stock FROM producto WHERE id_producto = 3'))[0].stock, 260);
  assert.equal(await stockSede(kaelin, PROD.BOLSA_ROJA), 70);
  assert.equal(await stockSede(kaelin, PROD.MASCARILLA), 40);
  const pendientes = await sql("SELECT COUNT(*) AS n FROM registro_error WHERE estado = 'PENDIENTE'");
  assert.equal(pendientes[0].n, 0, 'las dos diferencias del envío quedan cerradas');
  const [nueva] = await sql("SELECT confirmado_sede FROM movimiento WHERE tipo = 'SALIDA' AND estado = 'ACTIVO'");
  assert.equal(nueva.confirmado_sede, 'CONFORME');
});

test('cada sede solo ve y confirma sus envíos; la sede sale de la sesión, no del formulario', async () => {
  await conteoInicial(barton);
  await conteoInicial(kaelin);
  const idKaelin = await enviar(SEDE.KAELIN, [{ id_producto: PROD.BOLSA_ROJA, cantidad_pedida: 10, cantidad: 10 }]);
  assert.equal((await barton.get('/api/sede/envios-pendientes')).datos.envios.length, 0);
  const r = await barton.put(`/api/sede/envios/${idKaelin}/confirmar`, { conforme: true, id_sede: SEDE.KAELIN });
  assert.equal(r.status, 404);
  assert.equal(await stockSede(barton, PROD.BOLSA_ROJA), 0);
  assert.equal(await stockSede(kaelin, PROD.BOLSA_ROJA), 10);
});

test('el turno se toma de la hora', () => {
  const a = (h) => turnoPara(new Date(2026, 9, 22, h, 30));
  assert.deepEqual([a(5), a(6), a(13), a(14), a(21), a(22)], ['NOCHE', 'MAÑANA', 'MAÑANA', 'TARDE', 'TARDE', 'NOCHE']);
});

test('el mismo consumo en menos de 10 minutos pide confirmar «¿Es otro consumo?» (HU-06)', async () => {
  await conteoInicial(barton, [{ id_producto: PROD.BOLSA_ROJA, cantidad: 50 }]);
  await barton.post('/api/sede/consumo', { id_producto: PROD.BOLSA_ROJA, cantidad: 5 });
  let r = await barton.post('/api/sede/consumo', { id_producto: PROD.BOLSA_ROJA, cantidad: 5 });
  assert.equal(r.status, 409);
  assert.match(r.datos.errores[0], /¿Es otro consumo\?/);
  r = await barton.post('/api/sede/consumo', { id_producto: PROD.BOLSA_ROJA, cantidad: 5, confirmar: true });
  assert.equal(r.status, 201);
  assert.equal(r.datos.queda, 40);
});

test('regla de 24 horas: corrección directa si es reciente; si es antigua la aprueba el jefe (RN-11, HU-07)', async () => {
  await conteoInicial(barton, [{ id_producto: PROD.BOLSA_ROJA, cantidad: 100 }]);
  const c1 = (await barton.post('/api/sede/consumo', { id_producto: PROD.BOLSA_ROJA, cantidad: 30 })).datos;
  assert.equal(c1.queda, 70);
  const [reciente] = await sql("SELECT id_consumo FROM consumo_sede WHERE tipo = 'CONSUMO'");
  let r = await barton.put(`/api/sede/consumos/${reciente.id_consumo}/corregir`, { accion: 'CORREGIR', cantidad_nueva: 3, motivo: 'DIGITACION' });
  assert.equal(r.datos.aplicado, true);
  assert.equal(await stockSede(barton, PROD.BOLSA_ROJA), 97);

  // Registro de hace 2 días: queda pendiente y no cambia nada hasta que el jefe lo apruebe
  await sql('UPDATE consumo_sede SET fecha = NOW() - INTERVAL 2 DAY WHERE id_consumo = ?', [reciente.id_consumo]);
  r = await barton.put(`/api/sede/consumos/${reciente.id_consumo}/corregir`, { accion: 'ANULAR', motivo: 'DUPLICADO' });
  assert.equal(r.datos.aplicado, false);
  assert.equal(await stockSede(barton, PROD.BOLSA_ROJA), 97);
  const [pend] = await sql("SELECT id_error FROM registro_error WHERE estado = 'PENDIENTE'");
  r = await jefe.put(`/api/errores/${pend.id_error}/aprobar`, {});
  assert.equal(r.status, 200);
  assert.equal(await stockSede(barton, PROD.BOLSA_ROJA), 100);
  const [c] = await sql('SELECT estado FROM consumo_sede WHERE id_consumo = ?', [reciente.id_consumo]);
  assert.equal(c.estado, 'ANULADO', 'nada se borra: el registro queda ANULADO (RN-10)');
  assert.equal((await sql('SELECT COUNT(*) AS n FROM registro_error'))[0].n, 2, 'cada cambio queda en registro_error');
});

test('una corrección que deja la sede en negativo no se aplica', async () => {
  await conteoInicial(barton, [{ id_producto: PROD.BOLSA_ROJA, cantidad: 10 }]);
  await barton.post('/api/sede/consumo', { id_producto: PROD.BOLSA_ROJA, cantidad: 8 });
  const [ini] = await sql("SELECT id_consumo FROM consumo_sede WHERE tipo = 'INICIAL'");
  const r = await barton.put(`/api/sede/consumos/${ini.id_consumo}/corregir`, { accion: 'CORREGIR', cantidad_nueva: 5, motivo: 'DIGITACION' });
  assert.equal(r.status, 400);
  assert.match(r.datos.errores[0], /quedaría en -3/);
  assert.equal(await stockSede(barton, PROD.BOLSA_ROJA), 2);
});

test('el conteo de verificación registra un ajuste por la diferencia', async () => {
  await conteoInicial(barton, [{ id_producto: PROD.MASCARILLA, cantidad: 40 }]);
  let r = await barton.post('/api/sede/verificacion', { id_producto: PROD.MASCARILLA, cantidad_fisica: 36 });
  assert.equal(r.datos.diferencia, -4);
  r = await barton.post('/api/sede/verificacion', { id_producto: PROD.MASCARILLA, cantidad_fisica: 36 });
  assert.equal(r.datos.diferencia, 0);
  const ajustes = await sql("SELECT cantidad, motivo FROM consumo_sede WHERE tipo = 'AJUSTE'");
  assert.deepEqual(ajustes.map((a) => [a.cantidad, a.motivo]), [[-4, 'Conteo de verificación']]);
});

test('panel de sedes: uso diario, días que alcanza y alerta de 2 días o menos (RF-12)', async () => {
  await conteoInicial(barton, [{ id_producto: PROD.BOLSA_ROJA, cantidad: 100 }]);
  await barton.post('/api/sede/consumo', { id_producto: PROD.BOLSA_ROJA, cantidad: 70 });
  const r = await jefe.get('/api/panel-sedes');
  const b = r.datos.sedes.find((s) => s.sede.id_sede === SEDE.BARTON);
  const fila = b.filas.find((f) => f.id_producto === PROD.BOLSA_ROJA);
  assert.equal(fila.uso_diario, 10);      // 70 / 7
  assert.equal(fila.dias_alcanza, 3);     // 30 / 10
  assert.equal(fila.alerta, false);
  await barton.post('/api/sede/consumo', { id_producto: PROD.BOLSA_ROJA, cantidad: 10 });
  const r2 = await jefe.get(`/api/panel-sedes?sede=${SEDE.BARTON}`);
  const f2 = r2.datos.sedes[0].filas.find((f) => f.id_producto === PROD.BOLSA_ROJA);
  assert.equal(f2.alerta, true);          // 20 / 11,43 = 1,7 días
  const k = r.datos.sedes.find((s) => s.sede.id_sede === SEDE.KAELIN);
  assert.equal(k.control_iniciado, false);
});
