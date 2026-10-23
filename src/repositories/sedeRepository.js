// Consultas de la tabla sede (equivale a SedeRepository.java)
async function listar(db, { soloActivas = false, tipo = null } = {}) {
  const where = [];
  const p = [];
  if (soloActivas) where.push('activo = 1');
  if (tipo) { where.push('tipo = ?'); p.push(tipo); }
  const [filas] = await db.query(
    `SELECT * FROM sede ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY tipo DESC, nombre`, p);
  return filas;
}

async function buscar(db, id) {
  const [[fila]] = await db.query('SELECT * FROM sede WHERE id_sede = ?', [id]);
  return fila || null;
}

/** Bloquea la sede hasta el fin de la transacción (equivale a PESSIMISTIC_WRITE). */
async function buscarParaActualizar(db, id) {
  const [[fila]] = await db.query('SELECT * FROM sede WHERE id_sede = ? FOR UPDATE', [id]);
  return fila || null;
}

async function insertar(db, { nombre, tipo }) {
  const [r] = await db.query('INSERT INTO sede (nombre, tipo) VALUES (?, ?)', [nombre, tipo]);
  return r.insertId;
}

async function actualizar(db, id, { nombre, tipo }) {
  await db.query('UPDATE sede SET nombre = ?, tipo = ? WHERE id_sede = ?', [nombre, tipo, id]);
}

async function cambiarEstado(db, id, activo) {
  await db.query('UPDATE sede SET activo = ? WHERE id_sede = ?', [activo ? 1 : 0, id]);
}

async function iniciarControl(db, id) {
  await db.query('UPDATE sede SET fecha_inicio_control = CURDATE() WHERE id_sede = ?', [id]);
}

module.exports = { listar, buscar, buscarParaActualizar, insertar, actualizar, cambiarEstado, iniciarControl };
