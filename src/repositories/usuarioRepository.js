// Consultas de la tabla usuario (equivale a UsuarioRepository.java)
const COLUMNAS = `u.id_usuario, u.nombres, u.username, u.rol, u.id_sede, u.activo, s.nombre AS sede`;

async function listar(db) {
  const [filas] = await db.query(
    `SELECT ${COLUMNAS} FROM usuario u LEFT JOIN sede s ON s.id_sede = u.id_sede ORDER BY u.activo DESC, u.username`);
  return filas;
}

async function buscar(db, id) {
  const [[fila]] = await db.query(
    `SELECT ${COLUMNAS} FROM usuario u LEFT JOIN sede s ON s.id_sede = u.id_sede WHERE u.id_usuario = ?`, [id]);
  return fila || null;
}

/** Incluye el hash de la contraseña: solo para el inicio de sesión. */
async function buscarPorUsername(db, username) {
  const [[fila]] = await db.query(
    `SELECT u.*, s.nombre AS sede FROM usuario u LEFT JOIN sede s ON s.id_sede = u.id_sede WHERE u.username = ?`,
    [username]);
  return fila || null;
}

async function insertar(db, { nombres, username, password, rol, id_sede }) {
  const [r] = await db.query(
    'INSERT INTO usuario (nombres, username, password, rol, id_sede) VALUES (?, ?, ?, ?, ?)',
    [nombres, username, password, rol, id_sede]);
  return r.insertId;
}

async function actualizar(db, id, { nombres, username, rol, id_sede, password }) {
  if (password) {
    await db.query('UPDATE usuario SET nombres = ?, username = ?, rol = ?, id_sede = ?, password = ? WHERE id_usuario = ?',
      [nombres, username, rol, id_sede, password, id]);
  } else {
    await db.query('UPDATE usuario SET nombres = ?, username = ?, rol = ?, id_sede = ? WHERE id_usuario = ?',
      [nombres, username, rol, id_sede, id]);
  }
}

async function cambiarEstado(db, id, activo) {
  await db.query('UPDATE usuario SET activo = ? WHERE id_usuario = ?', [activo ? 1 : 0, id]);
}

module.exports = { listar, buscar, buscarPorUsername, insertar, actualizar, cambiarEstado };
