// Exporta el historial de demostración de la base a database/datos_demo_30_dias.sql, para cargarlo
// en MySQL Workbench sin Node.js. Las fechas se escriben relativas al momento en que se ejecuta el
// script (NOW()), así el historial siempre termina «hoy» y ningún registro queda en el futuro.
//   Uso: npm run demo y luego npm run demo:sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const { getPool } = require('../src/config/db');

const db = getPool();
const q = async (sql, p = []) => (await db.query(sql, p))[0];

(async () => {
  const [[{ ahora }]] = await db.query("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS ahora");
  const base = new Date(ahora.replace(' ', 'T'));
  const rel = (f) => (f ? `@ahora - INTERVAL ${Math.round((base - new Date(f.replace(' ', 'T'))) / 1000)} SECOND` : 'NULL');
  const v = (x) => mysql.escape(x);

  const insert = (tabla, columnas, filas, valores) => {
    if (!filas.length) return '';
    const cuerpo = filas.map((f) => `(${valores(f).join(', ')})`).join(',\n ');
    return `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES\n ${cuerpo};\n\n`;
  };

  const sedes = await q('SELECT id_sede, fecha_inicio_control FROM sede WHERE fecha_inicio_control IS NOT NULL');
  const productos = await q('SELECT id_producto, codigo, stock, stock_minimo FROM producto');
  const movimientos = await q('SELECT * FROM movimiento ORDER BY id_movimiento');
  const detalles = await q('SELECT * FROM detalle_movimiento ORDER BY id_detalle');
  const consumos = await q('SELECT * FROM consumo_sede ORDER BY id_consumo');
  const errores = await q('SELECT * FROM registro_error ORDER BY id_error');

  let sql = `-- =====================================================================
--  Historial de demostración de 30 días · Sistema de almacén SRH S.A.C.
--  Ejecutar DESPUÉS de bd_almacen_srh.sql, sobre la base recién creada.
--  Las fechas son relativas al momento de la carga: el historial termina hoy.
--  Contenido: ${movimientos.length} movimientos, ${consumos.length} registros de sedes y ${errores.length} registros de errores.
--  Generado con: npm run demo && npm run demo:sql
-- =====================================================================
USE bd_almacen_srh;
SET @ahora = NOW();

-- Los hospitales iniciaron su control con el conteo inicial de hace 30 días
`;
  for (const s of sedes) {
    const conteo = consumos.find((c) => c.id_sede === s.id_sede && c.tipo === 'INICIAL');
    sql += `UPDATE sede SET fecha_inicio_control = DATE(${rel(conteo.fecha)}) WHERE id_sede = ${s.id_sede};\n`;
  }
  sql += '\n-- Movimientos del almacén central (entradas, salidas y ajustes) y su kardex\n';
  sql += insert('movimiento', ['id_movimiento', 'tipo', 'fecha', 'observacion', 'id_usuario', 'id_sede', 'estado', 'confirmado_sede'], movimientos,
    (m) => [m.id_movimiento, v(m.tipo), rel(m.fecha), v(m.observacion), m.id_usuario, v(m.id_sede), v(m.estado), v(m.confirmado_sede)]);
  sql += insert('detalle_movimiento', ['id_detalle', 'id_movimiento', 'id_producto', 'cantidad_pedida', 'cantidad', 'stock_resultante'], detalles,
    (d) => [d.id_detalle, d.id_movimiento, d.id_producto, v(d.cantidad_pedida), d.cantidad, d.stock_resultante]);
  sql += '-- Conteos, consumos por turno y ajustes de los hospitales\n';
  sql += insert('consumo_sede', ['id_consumo', 'id_sede', 'id_producto', 'id_usuario', 'tipo', 'fecha', 'cantidad', 'turno', 'motivo', 'estado'], consumos,
    (c) => [c.id_consumo, c.id_sede, c.id_producto, c.id_usuario, v(c.tipo), rel(c.fecha), c.cantidad, v(c.turno), v(c.motivo), v(c.estado)]);
  sql += '-- Correcciones, anulaciones y diferencias de envío\n';
  sql += insert('registro_error', ['id_error', 'id_consumo', 'id_movimiento', 'accion', 'valor_anterior', 'valor_nuevo', 'motivo', 'detalle',
    'id_usuario_reporta', 'id_usuario_revisa', 'fecha_reporte', 'fecha_revision', 'estado'], errores,
  (e) => [e.id_error, v(e.id_consumo), v(e.id_movimiento), v(e.accion), v(e.valor_anterior), v(e.valor_nuevo), v(e.motivo), v(e.detalle),
    e.id_usuario_reporta, v(e.id_usuario_revisa), rel(e.fecha_reporte), rel(e.fecha_revision), v(e.estado)]);
  sql += '-- Stock final del almacén (igual al último saldo del kardex) y stock mínimo calculado (RN-07)\n';
  for (const p of productos) {
    sql += `UPDATE producto SET stock = ${p.stock}, stock_minimo = ${p.stock_minimo} WHERE id_producto = ${p.id_producto};  -- ${p.codigo}\n`;
  }

  const destino = path.join(__dirname, 'datos_demo_30_dias.sql');
  fs.writeFileSync(destino, sql, 'utf8');
  console.log(`Exportado ${destino} (${Math.round(sql.length / 1024)} KB)`);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.end());
