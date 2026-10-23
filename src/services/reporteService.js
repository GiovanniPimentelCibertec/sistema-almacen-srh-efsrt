// Reportes y panel de inicio (equivale a ReporteService.java).
// En Java los reportes salían en PDF con JasperReports; según el informe EFSRT se muestran en pantalla
// y se imprimen o guardan en PDF desde el navegador (window.print) con una hoja de estilos de impresión.
const { getPool } = require('../config/db');
const { NegocioError } = require('../util/errores');
const detalleRepo = require('../repositories/detalleMovimientoRepository');
const movimientoRepo = require('../repositories/movimientoRepository');
const errorRepo = require('../repositories/registroErrorRepository');

/** CU11 · RF-08: total despachado por producto y sede en un mes (vista v_despacho_sede_mes). */
async function consumoSedeMes({ mes, sede } = {}) {
  if (mes && !/^\d{4}-\d{2}$/.test(mes)) throw new NegocioError('Elija el mes (AAAA-MM).');
  const where = [];
  const p = [];
  if (mes) { where.push('mes = ? COLLATE utf8mb4_general_ci'); p.push(mes); } // columna calculada de la vista
  if (sede) { where.push('sede = ?'); p.push(sede); }
  const [filas] = await getPool().query(
    `SELECT * FROM v_despacho_sede_mes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY mes DESC, sede, codigo`, p);
  const totales = {};
  for (const f of filas) totales[f.sede] = Math.round(((totales[f.sede] || 0) + Number(f.total_despachado)) * 100) / 100;
  return { mes: mes || null, sede: sede || null, filas, totales };
}

/** CU11 · RF-08: productos con stock menor o igual al mínimo y cuánto falta (vista v_bajo_minimo). */
async function bajoMinimo() {
  const [filas] = await getPool().query('SELECT * FROM v_bajo_minimo ORDER BY falta DESC, codigo');
  return filas;
}

/** Panel de inicio: totales, productos por reponer y últimos movimientos. */
async function panel(rol) {
  const db = getPool();
  const [[t]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM producto WHERE activo = 1) AS productos,
            (SELECT COUNT(*) FROM sede WHERE activo = 1) AS sedes,
            (SELECT COUNT(*) FROM usuario WHERE activo = 1) AS usuarios`);
  const datos = {
    totales: { ...t, movimientos: await movimientoRepo.contarActivos(db) },
    reponer: await bajoMinimo(),
    ultimos: await detalleRepo.ultimos(db, 8),
  };
  if (rol === 'JEFE') datos.totales.errores_pendientes = await errorRepo.contarPendientes(db);
  return datos;
}

module.exports = { consumoSedeMes, bajoMinimo, panel };
