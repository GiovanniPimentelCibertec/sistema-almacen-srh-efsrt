// Consultas de la tabla marca (equivale a MarcaRepository.java)
async function listar(db, { soloActivas = false } = {}) {
  const [filas] = await db.query(
    `SELECT m.*, (SELECT COUNT(*) FROM producto p WHERE p.id_marca = m.id_marca AND p.activo = 1) AS productos
       FROM marca m ${soloActivas ? 'WHERE m.activo = 1' : ''} ORDER BY m.activo DESC, m.nombre`);
  return filas;
}

async function buscar(db, id) {
  const [[fila]] = await db.query('SELECT * FROM marca WHERE id_marca = ?', [id]);
  return fila || null;
}

async function insertar(db, nombre) {
  const [r] = await db.query('INSERT INTO marca (nombre) VALUES (?)', [nombre]);
  return r.insertId;
}

async function actualizar(db, id, nombre) {
  await db.query('UPDATE marca SET nombre = ? WHERE id_marca = ?', [nombre, id]);
}

async function cambiarEstado(db, id, activo) {
  await db.query('UPDATE marca SET activo = ? WHERE id_marca = ?', [activo ? 1 : 0, id]);
}

async function productosActivos(db, id) {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM producto WHERE id_marca = ? AND activo = 1', [id]);
  return n;
}

module.exports = { listar, buscar, insertar, actualizar, cambiarEstado, productosActivos };
