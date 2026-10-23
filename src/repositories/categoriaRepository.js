// Consultas de la tabla categoria (equivale a CategoriaRepository.java)
async function listar(db, { soloActivas = false } = {}) {
  const [filas] = await db.query(
    `SELECT c.*, (SELECT COUNT(*) FROM producto p WHERE p.id_categoria = c.id_categoria AND p.activo = 1) AS productos
       FROM categoria c ${soloActivas ? 'WHERE c.activo = 1' : ''} ORDER BY c.activo DESC, c.nombre`);
  return filas;
}

async function buscar(db, id) {
  const [[fila]] = await db.query('SELECT * FROM categoria WHERE id_categoria = ?', [id]);
  return fila || null;
}

async function insertar(db, nombre) {
  const [r] = await db.query('INSERT INTO categoria (nombre) VALUES (?)', [nombre]);
  return r.insertId;
}

async function actualizar(db, id, nombre) {
  await db.query('UPDATE categoria SET nombre = ? WHERE id_categoria = ?', [nombre, id]);
}

async function cambiarEstado(db, id, activo) {
  await db.query('UPDATE categoria SET activo = ? WHERE id_categoria = ?', [activo ? 1 : 0, id]);
}

async function productosActivos(db, id) {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM producto WHERE id_categoria = ? AND activo = 1', [id]);
  return n;
}

module.exports = { listar, buscar, insertar, actualizar, cambiarEstado, productosActivos };
