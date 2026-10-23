// Pruebas de sesión, roles y catálogos (en Java las cubría Spring Security)
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, terminar, reiniciarBase, sql, cliente, como } = require('./apoyo');

before(iniciar);
after(terminar);
beforeEach(reiniciarBase);

test('login: contraseña incorrecta y usuario desactivado no entran (CU01, CU02)', async () => {
  const c = cliente();
  let r = await c.post('/api/login', { username: 'jefe', password: 'otra' });
  assert.equal(r.status, 401);
  await sql("UPDATE usuario SET activo = 0 WHERE username = 'asistente'");
  r = await c.post('/api/login', { username: 'asistente', password: '123456' });
  assert.equal(r.status, 403);
  r = await c.post('/api/login', { username: 'barton', password: '123456' });
  assert.equal(r.datos.inicio, '/sede');
  r = await c.get('/api/me');
  assert.deepEqual([r.datos.usuario.rol, r.datos.usuario.id_sede], ['SEDE', 2]);
  assert.equal(r.datos.usuario.password, undefined, 'la contraseña nunca sale del servidor');
});

test('cada rol solo usa sus rutas: el servidor responde 401 sin sesión y 403 con otro rol', async () => {
  assert.equal((await cliente().get('/api/productos')).status, 401);
  const [admin, jefe, asistente, barton] = await Promise.all(['admin', 'jefe', 'asistente', 'barton'].map(como));
  const casos = [
    [admin, 'GET', '/api/usuarios', 200], [jefe, 'GET', '/api/usuarios', 403],
    [asistente, 'GET', '/api/productos', 200], [asistente, 'POST', '/api/productos', 403],
    [asistente, 'GET', '/api/marcas', 200], [asistente, 'POST', '/api/marcas', 403],
    [jefe, 'POST', '/api/categorias', 403], [admin, 'GET', '/api/kardex?producto=1', 403],
    [barton, 'GET', '/api/stock', 403], [jefe, 'GET', '/api/sede/stock', 403],
    [asistente, 'GET', '/api/errores', 403], [jefe, 'GET', '/api/errores', 200],
    [barton, 'GET', '/api/panel', 403], [admin, 'GET', '/api/panel', 200],
  ];
  for (const [cli, metodo, ruta, esperado] of casos) {
    const r = metodo === 'GET' ? await cli.get(ruta) : await cli.post(ruta, {});
    assert.equal(r.status, esperado, `${metodo} ${ruta}`);
  }
});

test('las pantallas piden sesión y respetan el rol', async () => {
  let r = await cliente().get('/productos');
  assert.equal(r.status, 302);
  assert.equal(r.location, '/login');
  const barton = await como('barton');
  r = await barton.get('/');
  assert.equal(r.location, '/sede');
  r = await barton.get('/productos');
  assert.equal(r.status, 403);
  const asistente = await como('asistente');
  assert.equal((await asistente.get('/productos')).status, 200);
  assert.equal((await asistente.get('/productos/nuevo')).status, 403);
});

test('nada se borra: no existen rutas DELETE y los catálogos se desactivan (RN-10)', async () => {
  const admin = await como('admin');
  const jefe = await como('jefe');
  assert.equal((await admin.del('/api/categorias/1')).status, 404);
  assert.equal((await jefe.del('/api/productos/1')).status, 404);
  let r = await admin.put('/api/categorias/1/estado', { activo: false });
  assert.equal(r.status, 400, 'no se desactiva una categoría con productos activos');
  r = await admin.post('/api/categorias', { nombre: 'Repuestos' });
  r = await admin.put(`/api/categorias/${r.datos.id}/estado`, { activo: false });
  assert.equal(r.status, 200);
  assert.equal((await sql("SELECT activo FROM categoria WHERE nombre = 'Repuestos'"))[0].activo, 0);
});

test('códigos y usuarios únicos (RN-01) y producto nuevo con stock 0 (RN-02)', async () => {
  const jefe = await como('jefe');
  const nuevo = { codigo: 'bol-003', nombre: 'Bolsa amarilla', unidad: 'unidad', id_categoria: 1, dias_reposicion: 7, minimo_inicial: 25 };
  let r = await jefe.post('/api/productos', nuevo);
  assert.equal(r.status, 201);
  const [p] = await sql("SELECT stock, stock_minimo FROM producto WHERE codigo = 'BOL-003'");
  assert.deepEqual([p.stock, p.stock_minimo], [0, 25]);
  r = await jefe.post('/api/productos', nuevo);
  assert.equal(r.status, 409);
  assert.equal(r.datos.errores[0], 'Ese código ya existe.');
  const admin = await como('admin');
  r = await admin.post('/api/usuarios', { nombres: 'Otro', username: 'jefe', password: '123456', rol: 'JEFE' });
  assert.equal(r.datos.errores[0], 'Ese nombre de usuario ya existe.');
});

test('usuarios: el rol SEDE siempre lleva un hospital y la contraseña se guarda cifrada', async () => {
  const admin = await como('admin');
  let r = await admin.post('/api/usuarios', { nombres: 'Encargada', username: 'nueva', password: 'clave123', rol: 'SEDE' });
  assert.equal(r.status, 400);
  r = await admin.post('/api/usuarios', { nombres: 'Encargada', username: 'nueva', password: 'clave123', rol: 'SEDE', id_sede: 3 });
  assert.equal(r.status, 201);
  const [u] = await sql("SELECT password, id_sede FROM usuario WHERE username = 'nueva'");
  assert.match(u.password, /^\$2[aby]\$10\$/);
  assert.equal(u.id_sede, 3);
  await cliente().login('nueva', 'clave123').then(() => {}, () => assert.fail('el usuario nuevo debe poder entrar'));
  r = await admin.put('/api/usuarios/1/estado', { activo: false });
  assert.equal(r.status, 400, 'el administrador no se desactiva a sí mismo');
});
