// Consultas de la tabla movimiento (equivale a MovimientoRepository.java)
const SELECT = `
  SELECT m.*, s.nombre AS sede, s.tipo AS tipo_sede, u.username AS registrado_por,
         (SELECT COUNT(*) FROM detalle_movimiento d WHERE d.id_movimiento = m.id_movimiento) AS productos,
         (SELECT SUM(ABS(d.cantidad)) FROM detalle_movimiento d WHERE d.id_movimiento = m.id_movimiento) AS unidades
    FROM movimiento m
    JOIN usuario u ON u.id_usuario = m.id_usuario
    LEFT JOIN sede s ON s.id_sede = m.id_sede`;

async function insertar(db, { tipo, observacion, id_usuario, id_sede = null, confirmado_sede = null }) {
  const [r] = await db.query(
    'INSERT INTO movimiento (tipo, observacion, id_usuario, id_sede, confirmado_sede) VALUES (?, ?, ?, ?, ?)',
    [tipo, observacion || null, id_usuario, id_sede, confirmado_sede]);
  return r.insertId;
}

/** Historial con filtros: tipo, sede y rango de fechas (incluye los anulados, marcados). */
async function listar(db, { tipo, id_sede, desde, hasta, limite = 300 } = {}) {
  const where = [];
  const p = [];
  if (tipo) { where.push('m.tipo = ?'); p.push(tipo); }
  if (id_sede) { where.push('m.id_sede = ?'); p.push(id_sede); }
  if (desde) { where.push('m.fecha >= ?'); p.push(desde + ' 00:00:00'); }
  if (hasta) { where.push('m.fecha < ? + INTERVAL 1 DAY'); p.push(hasta); }
  p.push(limite);
  const [filas] = await db.query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.fecha DESC, m.id_movimiento DESC LIMIT ?`, p);
  return filas;
}

async function buscar(db, id) {
  const [[fila]] = await db.query(`${SELECT} WHERE m.id_movimiento = ?`, [id]);
  return fila || null;
}

async function buscarParaActualizar(db, id) {
  const [[fila]] = await db.query('SELECT * FROM movimiento WHERE id_movimiento = ? FOR UPDATE', [id]);
  return fila || null;
}

async function marcarConfirmado(db, id, valor) {
  await db.query('UPDATE movimiento SET confirmado_sede = ? WHERE id_movimiento = ?', [valor, id]);
}

async function anular(db, id) {
  await db.query("UPDATE movimiento SET estado = 'ANULADO' WHERE id_movimiento = ?", [id]);
}

/** Envíos de un hospital que aún no confirma, desde el inicio de su control (vista v_envios_pendientes). */
async function enviosPendientes(db, id_sede, fechaInicioControl) {
  const [filas] = await db.query(
    `SELECT v.id_movimiento, v.fecha, v.sede, m.observacion
       FROM v_envios_pendientes v JOIN movimiento m ON m.id_movimiento = v.id_movimiento
      WHERE v.id_sede = ? AND DATE(v.fecha) >= ? ORDER BY v.fecha, v.id_movimiento`,
    [id_sede, fechaInicioControl]);
  return filas;
}

async function contarActivos(db) {
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM movimiento WHERE estado = 'ACTIVO'");
  return n;
}

module.exports = { insertar, listar, buscar, buscarParaActualizar, marcarConfirmado, anular, enviosPendientes, contarActivos };
