// Carga 30 días de datos simulados (entradas, salidas a los hospitales, conteos y consumos por turno),
// como el historial de prueba del proyecto Java. Usa los mismos servicios del sistema, así que se respetan
// todas las reglas; después mueve cada registro a su fecha. Solo funciona sobre una base recién creada.
//   Uso: npm run demo
require('dotenv').config();
const { getPool } = require('../src/config/db');
const mov = require('../src/services/movimientoService');
const hosp = require('../src/services/hospitalService');

const JEFE = 2;
const ASISTENTE = 3;
const BARTON = { id_sede: 2, usuario: 4 };
const KAELIN = { id_sede: 3, usuario: 5 };
const DIAS = 30;

// Generador pseudoaleatorio con semilla: siempre los mismos datos
let semilla = 20261021;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const entre = (a, b) => Math.round(a + azar() * (b - a));

const db = getPool();
const fechaDe = (dia, hora) => `DATE_SUB(CURDATE(), INTERVAL ${dia} DAY) + INTERVAL ${hora} HOUR + INTERVAL ${entre(0, 50)} MINUTE`;
const fechar = (tabla, columna, id, dia, hora) => db.query(`UPDATE ${tabla} SET fecha = ${fechaDe(dia, hora)} WHERE ${columna} = ?`, [id]);
const ultimo = async (tabla, columna) => (await db.query(`SELECT MAX(${columna}) AS id FROM ${tabla}`))[0][0].id;

async function main() {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM movimiento');
  if (n > 0) {
    console.log('La base ya tiene movimientos: no se cargan datos de demostración.');
    return;
  }
  const [productos] = await db.query('SELECT id_producto, codigo FROM producto WHERE activo = 1 ORDER BY id_producto');
  const consumoDiario = { 'BOL-001': [12, 22], 'BOL-002': [6, 12], 'EPP-001': [4, 9], 'EPP-002': [0, 1], 'UNI-001': [0, 1], 'LIM-001': [0, 1] };

  // Día 30: compra inicial y conteo inicial de los dos hospitales
  const compra = { 'BOL-001': 1800, 'BOL-002': 900, 'EPP-001': 600, 'EPP-002': 40, 'UNI-001': 60, 'LIM-001': 30 };
  let r = await mov.registrarEntrada(ASISTENTE, { observacion: 'GR 001-4512 Plastisur / 3M', lineas: productos.map((p) => ({ id_producto: p.id_producto, cantidad: compra[p.codigo] })) });
  await fechar('movimiento', 'id_movimiento', r.id_movimiento, DIAS, 9);
  for (const s of [BARTON, KAELIN]) {
    await hosp.conteoInicial(s.id_sede, s.usuario, { items: productos.map((p) => ({ id_producto: p.id_producto, cantidad: Math.round(compra[p.codigo] * 0.03) })) });
    await db.query(`UPDATE sede SET fecha_inicio_control = DATE_SUB(CURDATE(), INTERVAL ${DIAS} DAY) WHERE id_sede = ?`, [s.id_sede]);
    await db.query(`UPDATE consumo_sede SET fecha = ${fechaDe(DIAS, 7)} WHERE id_sede = ? AND tipo = 'INICIAL'`, [s.id_sede]);
  }

  for (let dia = DIAS - 1; dia >= 1; dia--) {
    // Compras de reposición cada 10 días
    if (dia % 10 === 0) {
      r = await mov.registrarEntrada(ASISTENTE, { observacion: `GR 001-${4600 + dia}`, lineas: [
        { id_producto: 1, cantidad: 700 }, { id_producto: 2, cantidad: 300 }, { id_producto: 3, cantidad: 200 }] });
      await fechar('movimiento', 'id_movimiento', r.id_movimiento, dia, 9);
    }
    // Envíos a los hospitales cada 3 días (Barton) y cada 4 días (Kaelin)
    for (const [s, cada] of [[BARTON, 3], [KAELIN, 4]]) {
      if (dia % cada !== 0) continue;
      const lineas = productos.filter((p) => consumoDiario[p.codigo][1] > 1 || dia % 9 === 0).map((p) => {
        const pedida = Math.max(1, Math.round(((consumoDiario[p.codigo][0] + consumoDiario[p.codigo][1]) / 2) * cada * 1.1));
        return { id_producto: p.id_producto, cantidad_pedida: pedida, cantidad: dia === 8 && p.codigo === 'EPP-001' ? pedida - 10 : pedida };
      });
      r = await mov.registrarSalida(dia % 2 ? JEFE : ASISTENTE, { id_sede: s.id_sede, observacion: `Pedido ${s === BARTON ? 'Barton' : 'Kaelin'} día ${DIAS - dia}`, lineas });
      await fechar('movimiento', 'id_movimiento', r.id_movimiento, dia, 8);
      // El hospital confirma el envío (el último de Kaelin queda pendiente; uno llega con diferencia)
      if (!(s === KAELIN && dia <= 4)) {
        const conforme = !(s === BARTON && dia === 15);
        const recibidos = {};
        if (!conforme) for (const l of lineas) recibidos[l.id_producto] = l.id_producto === 1 ? l.cantidad - 20 : l.cantidad;
        await hosp.confirmarEnvio(s.id_sede, s.usuario, r.id_movimiento, conforme ? { conforme: true } : { recibidos });
        await db.query(`UPDATE registro_error SET fecha_reporte = ${fechaDe(dia, 11)} WHERE id_movimiento = ?`, [r.id_movimiento]);
      }
    }
    // Consumo por turno en cada hospital
    for (const s of [BARTON, KAELIN]) {
      for (const [turno, hora] of [['MAÑANA', 10], ['TARDE', 17], ['NOCHE', 23]]) {
        for (const p of productos) {
          const [a, b] = consumoDiario[p.codigo];
          const cantidad = Math.max(0, Math.round(entre(a, b) / 3));
          if (!cantidad) continue;
          try {
            await hosp.registrarConsumo(s.id_sede, s.usuario, { id_producto: p.id_producto, cantidad, turno, confirmar: true });
            await fechar('consumo_sede', 'id_consumo', await ultimo('consumo_sede', 'id_consumo'), dia, hora);
          } catch (e) { /* sin stock suficiente en la sede: ese turno no se registra */ }
        }
      }
    }
  }
  // Un conteo de verificación en Kaelin hace 2 días
  await hosp.conteoVerificacion(KAELIN.id_sede, KAELIN.usuario, { id_producto: 2, cantidad_fisica: 0 }).catch(() => {});
  // Stock mínimo con el historial real (RN-07)
  for (const p of productos) await db.query(`UPDATE producto p SET p.stock_minimo = COALESCE(ROUND((SELECT SUM(d.cantidad) FROM detalle_movimiento d JOIN movimiento m ON m.id_movimiento = d.id_movimiento WHERE d.id_producto = p.id_producto AND m.tipo = 'SALIDA' AND m.estado = 'ACTIVO' AND m.fecha >= NOW() - INTERVAL 90 DAY) / 90 * p.dias_reposicion, 2), p.minimo_inicial) WHERE p.id_producto = ?`, [p.id_producto]);

  const [[t]] = await db.query(`SELECT (SELECT COUNT(*) FROM movimiento) AS movimientos, (SELECT COUNT(*) FROM consumo_sede) AS registros_sede,
    (SELECT COUNT(*) FROM registro_error WHERE estado = 'PENDIENTE') AS pendientes`);
  console.log(`Datos de demostración cargados: ${t.movimientos} movimientos, ${t.registros_sede} registros de sedes, ${t.pendientes} diferencia(s) pendiente(s).`);
}

main().catch((e) => { console.error(e.errores || e); process.exitCode = 1; }).finally(() => db.end());
