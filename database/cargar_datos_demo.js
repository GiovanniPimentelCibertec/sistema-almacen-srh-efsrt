// Historial simulado de 30 días con lógica de negocio real, para demostrar el sistema.
// Usa los mismos servicios del sistema (se respetan todas las reglas RN-01 a RN-11) y después
// mueve cada registro a su día y hora. Solo funciona sobre una base recién creada.
//   Uso: npm run demo
//
// Lógica del mes simulado:
//  - Consumo de los hospitales por turno (mañana 45 %, tarde 35 %, noche 20 %), con variación diaria
//    y menos uso el fin de semana. Barton consume más que Kaelin.
//  - Envíos: Barton cada 3 días y Kaelin cada 4. Lo pedido cubre los días hasta el próximo envío más
//    2 de seguridad, menos lo que el hospital ya tiene. Si el almacén no tiene todo, se despacha menos
//    (entrega incompleta).
//  - Planta Callao: una salida semanal (bolsas negras, mascarillas, guantes, alcohol y chaquetas).
//  - Compras: cuando un producto alcanza para pocos días, el jefe compra y la mercadería llega de 4 a 6
//    días después (15 para las chaquetas). Al final quedan productos por reponer con su compra en camino.
//  - Incidencias: dos envíos que llegan diferentes (uno resuelto como pérdida y otro pendiente),
//    correcciones dentro de 24 h, un duplicado anulado, una corrección de más de 24 h pendiente,
//    dos ajustes por conteo en el almacén y conteos semanales de verificación en las sedes.
require('dotenv').config();
const { getPool } = require('../src/config/db');
const mov = require('../src/services/movimientoService');
const hosp = require('../src/services/hospitalService');
const errores = require('../src/services/registroErrorService');
const consumoRepo = require('../src/repositories/consumoSedeRepository');

const JEFE = 2;
const ASISTENTE = 3;
const PLANTA = 1;
const BARTON = { id: 2, usuario: 4, nombre: 'Barton', cada: 3 };
const KAELIN = { id: 3, usuario: 5, nombre: 'Kaelin', cada: 4 };
const DIAS = 30;

// Productos del script: 1 BOL-001, 2 BOL-002, 3 EPP-001, 4 EPP-002, 5 UNI-001, 6 LIM-001
// Uso promedio por día en cada hospital y empaque en que se despacha
const USO = {
  2: { 1: 20, 2: 11, 3: 9, 4: 0.6, 5: 0.4, 6: 0.7 },
  3: { 1: 12, 2: 7, 3: 5, 4: 0.4, 5: 0.25, 6: 0.4 },
};
const EMPAQUE = { 1: 10, 2: 10, 3: 10, 4: 1, 5: 1, 6: 1 };
const PLANTA_SEMANAL = { 2: 40, 3: 30, 4: 3, 5: 2, 6: 3 };
const COMPRA_INICIAL = { 1: 700, 2: 450, 3: 380, 4: 22, 5: 22, 6: 18 };
const PROVEEDOR = { 1: 'Plastisur', 2: 'Plastisur', 3: '3M Perú', 4: 'Distribuidora Médica Lima', 5: 'Confecciones Textil Sur', 6: 'Distribuidora Médica Lima' };
const LLEGADA = { 1: 5, 2: 5, 3: 4, 4: 4, 5: 15, 6: 6 };   // días entre la compra y la entrada
const DIAS_COMPRA = { 1: 11, 2: 14, 3: 14, 4: 21, 5: 30, 6: 18 }; // días de consumo que cubre una compra
// En la última semana los proveedores de bolsas rojas y de alcohol se retrasan: el stock baja hasta su mínimo
// y aparece la alerta «REPONER» (y alguna entrega incompleta), con la compra todavía en camino.
const RETRASO = { 1: 5, 6: 5 };

// Generador pseudoaleatorio con semilla: siempre el mismo historial
let semilla = 20261022;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const entre = (a, b) => a + azar() * (b - a);
const db = getPool();
let guia = 4510;

const hora = (h, m) => `DATE_SUB(CURDATE(), INTERVAL ? DAY) + INTERVAL ${h * 60 + m} MINUTE`;
async function fechar(tabla, columna, id, dia, h, m = Math.floor(entre(0, 50))) {
  await db.query(`UPDATE ${tabla} SET ${tabla === 'registro_error' ? 'fecha_reporte' : 'fecha'} = ${hora(h, m)} WHERE ${columna} = ?`, [dia, id]);
}
const ultimo = async (tabla, columna) => (await db.query(`SELECT MAX(${columna}) AS id FROM ${tabla}`))[0][0].id;
const stockAlmacen = async () => new Map((await db.query('SELECT id_producto, stock FROM producto'))[0].map((p) => [p.id_producto, Number(p.stock)]));
const usoTotal = (p) => USO[2][p] + USO[3][p] + (PLANTA_SEMANAL[p] || 0) / 7;
const redondearA = (n, paso) => Math.ceil(n / paso) * paso;
const log = [];

async function main() {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM movimiento');
  if (n > 0) {
    console.log('La base ya tiene movimientos: los datos de demostración solo se cargan sobre una base recién creada.');
    return;
  }
  const productos = [1, 2, 3, 4, 5, 6];
  const comprasEnCamino = new Map(); // producto -> día de llegada

  // ---------------- Día 30: compra inicial y conteo inicial de los hospitales
  let r = await mov.registrarEntrada(ASISTENTE, { observacion: `GR 001-${guia++} compra inicial del mes`, lineas: productos.map((p) => ({ id_producto: p, cantidad: COMPRA_INICIAL[p] })) });
  await fechar('movimiento', 'id_movimiento', r.id_movimiento, DIAS, 9, 15);
  const inicial = { 2: { 1: 60, 2: 35, 3: 30, 4: 2, 5: 3, 6: 2 }, 3: { 1: 40, 2: 20, 3: 18, 4: 1, 5: 2, 6: 1 } };
  for (const s of [BARTON, KAELIN]) {
    await hosp.conteoInicial(s.id, s.usuario, { items: productos.map((p) => ({ id_producto: p, cantidad: inicial[s.id][p] })) });
    await db.query('UPDATE sede SET fecha_inicio_control = DATE_SUB(CURDATE(), INTERVAL ? DAY) WHERE id_sede = ?', [DIAS, s.id]);
    await db.query(`UPDATE consumo_sede SET fecha = ${hora(7, 30)} WHERE id_sede = ? AND tipo = 'INICIAL'`, [DIAS, s.id]);
  }

  for (let dia = DIAS - 1; dia >= 0; dia--) {
    const fecha = new Date(Date.now() - dia * 86400000);
    const finDeSemana = [0, 6].includes(fecha.getDay());
    const esHoy = dia === 0;

    // ---- 08:00 Salidas a los hospitales y a la planta (lo primero del día)
    for (const s of [BARTON, KAELIN]) {
      if (dia % s.cada !== 0 && !(esHoy && s === KAELIN)) continue;
      const stock = await stockAlmacen();
      const lineas = [];
      for (const p of productos) {
        const tiene = await consumoRepo.stockProducto(db, s.id, p);
        // Días hasta el próximo envío más reserva: 2 días, o 5 en los productos de poco uso (se piden por unidad)
        const necesita = USO[s.id][p] * (s.cada + (USO[s.id][p] < 1 ? 5 : 2)) - tiene;
        if (necesita <= 0.3) continue;
        const pedida = Math.max(EMPAQUE[p], redondearA(necesita, EMPAQUE[p]));
        const despachada = Math.min(pedida, Math.floor(stock.get(p) / EMPAQUE[p]) * EMPAQUE[p] || Math.floor(stock.get(p)));
        if (despachada > 0) lineas.push({ id_producto: p, cantidad_pedida: pedida, cantidad: despachada });
      }
      if (!lineas.length) continue;
      r = await mov.registrarSalida(dia % 2 ? JEFE : ASISTENTE, { id_sede: s.id, observacion: `Pedido Hospital ${s.nombre} (WhatsApp ${s.nombre === 'Barton' ? 'enfermería' : 'jefa de piso'})`, lineas });
      await fechar('movimiento', 'id_movimiento', r.id_movimiento, dia, 8, s === BARTON ? 5 : 35);
      s.ultimoEnvio = { id: r.id_movimiento, dia, lineas };
      if (lineas.some((l) => l.cantidad < l.cantidad_pedida)) log.push(`día ${dia}: entrega incompleta a ${s.nombre}`);
    }
    if (dia % 7 === 0 && dia > 0) {
      const stock = await stockAlmacen();
      const lineas = Object.entries(PLANTA_SEMANAL)
        .map(([p, c]) => ({ id_producto: Number(p), cantidad_pedida: c, cantidad: Math.min(c, Math.floor(stock.get(Number(p)))) }))
        .filter((l) => l.cantidad > 0);
      r = await mov.registrarSalida(ASISTENTE, { id_sede: PLANTA, observacion: 'Abastecimiento semanal de la planta', lineas });
      await fechar('movimiento', 'id_movimiento', r.id_movimiento, dia, 8, 50);
      if (lineas.some((l) => l.cantidad < l.cantidad_pedida)) log.push(`día ${dia}: entrega incompleta a la planta`);
    }

    // ---- 10:00 Llegan las compras
    for (const [p, llegada] of [...comprasEnCamino]) {
      if (llegada !== dia) continue;
      const cantidad = redondearA(usoTotal(p) * DIAS_COMPRA[p], p <= 3 ? 50 : 1);
      r = await mov.registrarEntrada(ASISTENTE, { observacion: `GR 001-${guia++} ${PROVEEDOR[p]}`, lineas: [{ id_producto: p, cantidad }] });
      await fechar('movimiento', 'id_movimiento', r.id_movimiento, dia, 10, 10 + p * 5);
      comprasEnCamino.delete(p);
      log.push(`día ${dia}: entrada de ${cantidad} del producto ${p}`);
    }

    // ---- 11:00 Los hospitales confirman lo que les llegó hoy
    for (const s of [BARTON, KAELIN]) {
      const e = s.ultimoEnvio;
      if (!e || e.dia !== dia || e.confirmado || (esHoy && s === KAELIN)) continue; // el envío de hoy a Kaelin sigue en camino
      let cuerpo = { conforme: true };
      const diferencia = (s === BARTON && (dia === 15 || dia === 3)) ? (dia === 15 ? 1 : 3) : null; // 15: bolsas rojas; 3: mascarillas
      if (diferencia) {
        cuerpo = { recibidos: Object.fromEntries(e.lineas.map((l) => [l.id_producto, l.id_producto === diferencia ? l.cantidad - (diferencia === 1 ? 20 : 10) : l.cantidad])) };
      }
      await hosp.confirmarEnvio(s.id, s.usuario, e.id, cuerpo);
      e.confirmado = true;
      if (diferencia) {
        const [[er]] = await db.query('SELECT MAX(id_error) AS id FROM registro_error WHERE id_movimiento = ?', [e.id]);
        await fechar('registro_error', 'id_error', er.id, dia, 11, 20);
        log.push(`día ${dia}: envío ${e.id} llegó diferente a ${s.nombre}`);
        if (dia === 15) { // al día siguiente el jefe lo revisa: se perdió en el camino
          await errores.aprobar(er.id, JEFE, { resolucion: 'PERDIDA' });
          const idAjuste = await ultimo('consumo_sede', 'id_consumo');
          await fechar('consumo_sede', 'id_consumo', idAjuste, dia - 1, 9, 5);
          await db.query(`UPDATE registro_error SET fecha_revision = ${hora(9, 5)} WHERE id_error = ?`, [dia - 1, er.id]);
        }
      }
    }

    // ---- Consumo por turno en los hospitales
    const turnos = esHoy ? [['MAÑANA', 9, 0.45], ['TARDE', 15, 0.35]] : [['MAÑANA', 9, 0.45], ['TARDE', 15, 0.35], ['NOCHE', 22, 0.20]];
    for (const s of [BARTON, KAELIN]) {
      const demanda = {};
      for (const p of productos) demanda[p] = USO[s.id][p] * (finDeSemana ? 0.85 : 1) * entre(0.8, 1.2);
      for (const [turno, h0, parte] of turnos) {
        for (const p of productos) {
          let cantidad = USO[s.id][p] >= 2 ? Math.round(demanda[p] * parte) : (azar() < USO[s.id][p] * parte * 1.2 ? 1 : 0);
          const hay = await consumoRepo.stockProducto(db, s.id, p);
          if (cantidad > hay) log.push(`día ${dia}: ${s.nombre} se quedó sin el producto ${p} (${turno}: quería ${cantidad}, había ${hay})`);
          cantidad = Math.min(cantidad, Math.floor(hay));
          if (cantidad <= 0) continue;
          await hosp.registrarConsumo(s.id, s.usuario, { id_producto: p, cantidad, turno, confirmar: true });
          const id = await ultimo('consumo_sede', 'id_consumo');
          await fechar('consumo_sede', 'id_consumo', id, dia, h0 + Math.floor(entre(0, 4)));
        }
      }
    }

    // ---- Incidencias del mes
    if (dia === 20) { // Barton digita mal un consumo de 4 bolsas negras (40, o 14 si no hay tantas) y lo corrige al momento
      const hay = await consumoRepo.stockProducto(db, BARTON.id, 2);
      const digitado = hay >= 40 ? 40 : 14;
      if (hay >= digitado) {
        await hosp.registrarConsumo(BARTON.id, BARTON.usuario, { id_producto: 2, cantidad: digitado, turno: 'TARDE', confirmar: true });
        const id = await ultimo('consumo_sede', 'id_consumo');
        await hosp.corregirRegistro(BARTON.id, BARTON.usuario, id, { accion: 'CORREGIR', cantidad_nueva: 4, motivo: 'DIGITACION', detalle: `Se escribió ${digitado} en lugar de 4` });
        await fechar('consumo_sede', 'id_consumo', id, dia, 18, 10);
        await fechar('registro_error', 'id_consumo', id, dia, 18, 25);
        await db.query(`UPDATE registro_error SET fecha_revision = ${hora(18, 25)} WHERE id_consumo = ?`, [dia, id]);
      }
    }
    if (dia === 12) { // Kaelin registra dos veces el mismo consumo y anula el duplicado
      await hosp.registrarConsumo(KAELIN.id, KAELIN.usuario, { id_producto: 3, cantidad: 2, turno: 'MAÑANA', confirmar: true });
      const id = await ultimo('consumo_sede', 'id_consumo');
      await hosp.corregirRegistro(KAELIN.id, KAELIN.usuario, id, { accion: 'ANULAR', motivo: 'DUPLICADO', detalle: 'Se guardó dos veces el mismo consumo' });
      await fechar('consumo_sede', 'id_consumo', id, dia, 11, 42);
      await fechar('registro_error', 'id_consumo', id, dia, 11, 50);
      await db.query(`UPDATE registro_error SET fecha_revision = ${hora(11, 50)} WHERE id_consumo = ?`, [dia, id]);
    }
    if (dia === 1) { // Barton nota hoy que un consumo de hace 3 días era 3 y no 5: más de 24 h, queda para el jefe
      const [[c]] = await db.query(`SELECT id_consumo FROM consumo_sede WHERE id_sede = ? AND id_producto = 1 AND tipo = 'CONSUMO'
        AND estado = 'ACTIVO' AND DATE(fecha) = DATE_SUB(CURDATE(), INTERVAL 3 DAY) ORDER BY id_consumo LIMIT 1`, [BARTON.id]);
      if (c) {
        await db.query('UPDATE consumo_sede SET cantidad = 5 WHERE id_consumo = ?', [c.id_consumo]);
        await hosp.corregirRegistro(BARTON.id, BARTON.usuario, c.id_consumo, { accion: 'CORREGIR', cantidad_nueva: 3, motivo: 'DIGITACION', detalle: 'En el cuaderno del turno figuran 3 bolsas' });
        await fechar('registro_error', 'id_consumo', c.id_consumo, dia, 10, 5);
      }
    }
    if (dia === 15 || dia === 8) { // Ajustes por conteo físico en el almacén (jefe, 17:30)
      const stock = await stockAlmacen();
      const [p, delta, motivo] = dia === 15 ? [1, -12, 'Conteo quincenal: 12 bolsas rotas por humedad'] : [4, 1, 'Conteo semanal: se encontró una caja mal ubicada'];
      r = await mov.registrarAjuste(JEFE, { id_producto: p, cantidad_fisica: stock.get(p) + delta, motivo });
      await fechar('movimiento', 'id_movimiento', r.id_movimiento, dia, 17, 30);
    }
    if ([23, 16, 9, 2].includes(dia)) { // Conteo de verificación semanal en cada hospital
      for (const s of [BARTON, KAELIN]) {
        for (const p of [1, 3]) {
          const hay = await consumoRepo.stockProducto(db, s.id, p);
          const diferencia = (dia === 16 && s === BARTON && p === 1) ? -2 : (dia === 9 && s === KAELIN && p === 3) ? -1 : 0;
          const res = await hosp.conteoVerificacion(s.id, s.usuario, { id_producto: p, cantidad_fisica: Math.max(0, hay + diferencia) });
          if (res.diferencia) await fechar('consumo_sede', 'id_consumo', await ultimo('consumo_sede', 'id_consumo'), dia, 21, 40);
        }
      }
    }

    // ---- 18:00 El jefe revisa la cobertura y compra lo que alcanza para pocos días
    const stock = await stockAlmacen();
    for (const p of productos) {
      if (comprasEnCamino.has(p)) continue;
      const cobertura = stock.get(p) / usoTotal(p);
      if (cobertura <= LLEGADA[p] + 1.5) {   // compra cuando lo que queda alcanza para el tiempo de entrega y un poco más
        comprasEnCamino.set(p, dia - LLEGADA[p] - (dia <= 10 ? RETRASO[p] || 0 : 0));
        log.push(`día ${dia}: compra del producto ${p} (alcanza ${cobertura.toFixed(1)} días), llega el día ${comprasEnCamino.get(p)}`);
      }
    }
  }

  // Stock mínimo con el historial completo (RN-07)
  await db.query(`UPDATE producto p SET p.stock_minimo = COALESCE(ROUND((SELECT SUM(d.cantidad) FROM detalle_movimiento d
    JOIN movimiento m ON m.id_movimiento = d.id_movimiento WHERE d.id_producto = p.id_producto AND m.tipo = 'SALIDA'
    AND m.estado = 'ACTIVO' AND m.fecha >= NOW() - INTERVAL 90 DAY) / 90 * p.dias_reposicion, 2), p.minimo_inicial)`);

  const [[t]] = await db.query(`SELECT (SELECT COUNT(*) FROM movimiento) AS movimientos, (SELECT COUNT(*) FROM consumo_sede) AS registros_sede,
    (SELECT COUNT(*) FROM registro_error WHERE estado = 'PENDIENTE') AS pendientes, (SELECT COUNT(*) FROM v_bajo_minimo) AS por_reponer,
    (SELECT COUNT(*) FROM v_envios_pendientes) AS envios_sin_confirmar`);
  if (process.env.DEMO_DETALLE) console.log(log.join('\n'));
  console.log(`Historial de ${DIAS} días cargado: ${t.movimientos} movimientos, ${t.registros_sede} registros de sedes, `
    + `${t.pendientes} pendiente(s) para el jefe, ${t.por_reponer} producto(s) por reponer y ${t.envios_sin_confirmar} envío(s) sin confirmar.`);
}

main().catch((e) => { console.error(e.errores || e); process.exitCode = 1; }).finally(() => db.end());
