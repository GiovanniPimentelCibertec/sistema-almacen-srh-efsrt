// Consultas de la tabla registro_error (equivale a RegistroErrorRepository.java)
const SELECT = `
  SELECT e.*, COALESCE(sc.nombre, sm.nombre) AS sede, COALESCE(c.id_sede, m.id_sede) AS id_sede,
         ur.username AS reportado_por, uv.username AS revisado_por,
         c.tipo AS tipo_registro, c.estado AS estado_registro, pc.codigo AS codigo_producto, pc.nombre AS producto,
         (e.fecha_reporte >= NOW() - INTERVAL 24 HOUR) AS dentro_24h
    FROM registro_error e
    LEFT JOIN consumo_sede c ON c.id_consumo = e.id_consumo
    LEFT JOIN producto pc ON pc.id_producto = c.id_producto
    LEFT JOIN sede sc ON sc.id_sede = c.id_sede
    LEFT JOIN movimiento m ON m.id_movimiento = e.id_movimiento
    LEFT JOIN sede sm ON sm.id_sede = m.id_sede
    JOIN usuario ur ON ur.id_usuario = e.id_usuario_reporta
    LEFT JOIN usuario uv ON uv.id_usuario = e.id_usuario_revisa`;

async function insertar(db, e) {
  const [r] = await db.query(
    `INSERT INTO registro_error (id_consumo, id_movimiento, accion, valor_anterior, valor_nuevo, motivo, detalle,
                                 id_usuario_reporta, id_usuario_revisa, fecha_revision, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${e.estado === 'PENDIENTE' ? 'NULL' : 'NOW()'}, ?)`,
    [e.id_consumo || null, e.id_movimiento || null, e.accion, e.valor_anterior, e.valor_nuevo, e.motivo,
      e.detalle || null, e.id_usuario_reporta, e.id_usuario_revisa || null, e.estado]);
  return r.insertId;
}

async function listar(db, { id_sede, estado } = {}) {
  const where = [];
  const p = [];
  if (id_sede) { where.push('COALESCE(c.id_sede, m.id_sede) = ?'); p.push(id_sede); }
  if (estado) { where.push('e.estado = ?'); p.push(estado); }
  const [filas] = await db.query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY e.estado = 'PENDIENTE' DESC, e.fecha_reporte DESC, e.id_error DESC LIMIT 300`, p);
  return filas;
}

async function buscar(db, id) {
  const [[fila]] = await db.query(`${SELECT} WHERE e.id_error = ?`, [id]);
  return fila || null;
}

async function buscarParaActualizar(db, id) {
  const [[fila]] = await db.query('SELECT * FROM registro_error WHERE id_error = ? FOR UPDATE', [id]);
  return fila || null;
}

/** Diferencias pendientes del mismo envío (un envío puede traer varios productos). */
async function diferenciasPendientesDe(db, id_movimiento) {
  const [filas] = await db.query(
    `SELECT * FROM registro_error WHERE id_movimiento = ? AND accion = 'DIFERENCIA' AND estado = 'PENDIENTE' FOR UPDATE`,
    [id_movimiento]);
  return filas;
}

async function pendientesDelConsumo(db, id_consumo) {
  const [[{ n }]] = await db.query(
    "SELECT COUNT(*) AS n FROM registro_error WHERE id_consumo = ? AND estado = 'PENDIENTE'", [id_consumo]);
  return n;
}

async function cerrar(db, id, { estado, id_usuario_revisa, id_consumo }) {
  await db.query(
    `UPDATE registro_error SET estado = ?, id_usuario_revisa = ?, fecha_revision = NOW(),
            id_consumo = COALESCE(?, id_consumo) WHERE id_error = ?`,
    [estado, id_usuario_revisa, id_consumo || null, id]);
}

async function contarPendientes(db, id_sede = null) {
  const [[{ n }]] = await db.query(
    `SELECT COUNT(*) AS n FROM registro_error e
       LEFT JOIN consumo_sede c ON c.id_consumo = e.id_consumo
       LEFT JOIN movimiento m ON m.id_movimiento = e.id_movimiento
      WHERE e.estado = 'PENDIENTE' ${id_sede ? 'AND COALESCE(c.id_sede, m.id_sede) = ?' : ''}`,
    id_sede ? [id_sede] : []);
  return n;
}

module.exports = {
  insertar, listar, buscar, buscarParaActualizar, diferenciasPendientesDe, pendientesDelConsumo, cerrar, contarPendientes,
};
