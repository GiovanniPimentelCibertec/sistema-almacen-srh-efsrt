// Control de errores del jefe de logística (CU15 · RF-11) y panel de sedes (CU16 · RF-12).
// En el proyecto Java esto estaba dentro de HospitalService (revisarDiferencia); el informe EFSRT
// pide además aprobar correcciones de más de 24 horas y resolver cada diferencia de envío.
const { getPool, enTransaccion } = require('../config/db');
const { NegocioError } = require('../util/errores');
const { stockSedeFila } = require('../validators/stockSedeFila');
const { aplicarCorreccion } = require('./hospitalService');
const { recalcularYAlertar } = require('./movimientoService');
const errorRepo = require('../repositories/registroErrorRepository');
const consumoRepo = require('../repositories/consumoSedeRepository');
const movimientoRepo = require('../repositories/movimientoRepository');
const detalleRepo = require('../repositories/detalleMovimientoRepository');
const productoRepo = require('../repositories/productoRepository');
const sedeRepo = require('../repositories/sedeRepository');

const redondear = (n) => Math.round(n * 100) / 100;
const RESOLUCIONES = {
  REGISTRO: 'Se registró mal: se anula la salida y se registra otra con lo que de verdad se envió',
  PERDIDA: 'Se perdió en el camino: se descuenta de la sede con un ajuste',
};

async function listar(filtros) {
  return errorRepo.listar(getPool(), filtros);
}

async function pendienteParaRevisar(cn, idError) {
  const e = await errorRepo.buscarParaActualizar(cn, idError);
  if (!e) throw new NegocioError('El registro de error no existe.', 404);
  if (e.estado !== 'PENDIENTE') throw new NegocioError('Este registro ya fue revisado.', 409);
  return e;
}

/** El producto de una diferencia de envío: el detalle empieza con su código. */
async function productoDeDiferencia(cn, e) {
  const codigo = (e.detalle || '').split(' ')[0];
  const p = await productoRepo.buscarPorCodigo(cn, codigo);
  if (!p) throw new NegocioError('No se pudo identificar el producto de la diferencia.');
  return p;
}

/**
 * Aprobar. Para una corrección pendiente (más de 24 h), aplica el cambio y recalcula.
 * Para una diferencia de envío, el jefe elige la resolución:
 *  - REGISTRO («se registró mal»): anula la salida original (el almacén recupera lo enviado) y registra
 *    una salida nueva con lo que de verdad se envió, ya confirmada por la sede.
 *  - PERDIDA («se perdió en el camino»): registra un AJUSTE negativo en la sede; el almacén central no cambia.
 */
async function aprobar(idError, idJefe, body = {}) {
  return enTransaccion(async (cn) => {
    const e = await pendienteParaRevisar(cn, idError);

    if (e.accion !== 'DIFERENCIA') {
      const c = await consumoRepo.buscarParaActualizar(cn, e.id_consumo);
      if (!c || c.estado !== 'ACTIVO') throw new NegocioError('El registro ya no está activo; rechace la corrección.');
      await aplicarCorreccion(cn, c, e.accion, e.valor_nuevo === null ? null : Number(e.valor_nuevo));
      await errorRepo.cerrar(cn, idError, { estado: 'APROBADO', id_usuario_revisa: idJefe });
      return { mensaje: e.accion === 'ANULAR' ? 'Anulación aprobada.' : 'Corrección aprobada y aplicada.' };
    }

    const resolucion = String(body.resolucion || '').toUpperCase();
    if (!RESOLUCIONES[resolucion]) {
      throw new NegocioError('Elija qué pasó con el envío: «se registró mal» o «se perdió en el camino».');
    }
    if (resolucion === 'PERDIDA') {
      const p = await productoDeDiferencia(cn, e);
      const m = await movimientoRepo.buscar(cn, e.id_movimiento);
      const falta = redondear(Number(e.valor_nuevo) - Number(e.valor_anterior)); // negativo
      const idAjuste = await consumoRepo.insertar(cn, {
        id_sede: m.id_sede, id_producto: p.id_producto, id_usuario: idJefe, tipo: 'AJUSTE', cantidad: falta,
        motivo: `Pérdida en el envío N.° ${e.id_movimiento}`,
      });
      const queda = await consumoRepo.stockProducto(cn, m.id_sede, p.id_producto);
      if (queda < 0) {
        throw new NegocioError(`No se puede: el stock de ${p.codigo} en ${m.sede} quedaría en ${queda}.`);
      }
      await errorRepo.cerrar(cn, idError, { estado: 'APROBADO', id_usuario_revisa: idJefe, id_consumo: idAjuste });
      return { mensaje: `Diferencia aprobada: se descontaron ${-falta} de ${p.codigo} en ${m.sede}.` };
    }
    return corregirEnvio(cn, e, idJefe);
  });
}

/** «Se registró mal»: rehace la salida con lo que de verdad llegó (todas las diferencias del envío juntas). */
async function corregirEnvio(cn, e, idJefe) {
  const original = await movimientoRepo.buscarParaActualizar(cn, e.id_movimiento);
  if (!original || original.estado !== 'ACTIVO') throw new NegocioError('La salida original ya no está activa.');
  const detalles = await detalleRepo.porMovimiento(cn, original.id_movimiento);
  const diferencias = await errorRepo.diferenciasPendientesDe(cn, original.id_movimiento);

  const recibido = new Map(detalles.map((d) => [d.id_producto, Number(d.cantidad)]));
  for (const dif of diferencias) {
    const p = await productoDeDiferencia(cn, dif);
    recibido.set(p.id_producto, Number(dif.valor_nuevo));
  }

  const productos = await productoRepo.bloquear(cn, detalles.map((d) => d.id_producto));
  // 1. Anular la salida original: el almacén central recupera lo enviado
  for (const d of detalles) {
    const p = productos.get(d.id_producto);
    p.stock = redondear(Number(p.stock) + Number(d.cantidad));
    await productoRepo.actualizarStock(cn, p.id_producto, p.stock);
  }
  await movimientoRepo.anular(cn, original.id_movimiento);

  // 2. Salida nueva con lo que de verdad se envió (ya confirmada por la sede)
  const lineas = detalles.filter((d) => recibido.get(d.id_producto) > 0);
  let idNuevo = null;
  if (lineas.length) {
    idNuevo = await movimientoRepo.insertar(cn, {
      tipo: 'SALIDA', id_usuario: idJefe, id_sede: original.id_sede, confirmado_sede: 'CONFORME',
      observacion: `Corrige la salida N.° ${original.id_movimiento}${original.observacion ? ' · ' + original.observacion : ''}`.slice(0, 200),
    });
    for (const d of lineas) {
      const p = productos.get(d.id_producto);
      const cantidad = recibido.get(d.id_producto);
      p.stock = redondear(Number(p.stock) - cantidad);
      await productoRepo.actualizarStock(cn, p.id_producto, p.stock);
      await detalleRepo.insertar(cn, {
        id_movimiento: idNuevo, id_producto: p.id_producto, cantidad_pedida: d.cantidad_pedida, cantidad, stock_resultante: p.stock,
      });
    }
  }
  // 3. Un envío cuyo material ya se consumió no se puede anular: la sede no puede quedar en negativo
  for (const d of detalles) {
    const queda = await consumoRepo.stockProducto(cn, original.id_sede, d.id_producto);
    if (queda < 0) {
      throw new NegocioError(`No se puede anular el envío: la sede ya consumió ${d.codigo} y su stock quedaría en ${queda}.`);
    }
  }
  await recalcularYAlertar(cn, detalles.map((d) => d.id_producto));
  for (const dif of diferencias) {
    await errorRepo.cerrar(cn, dif.id_error, { estado: 'APROBADO', id_usuario_revisa: idJefe });
  }
  return {
    id_movimiento_nuevo: idNuevo,
    mensaje: `Se anuló la salida N.° ${original.id_movimiento}${idNuevo ? ` y se registró la salida N.° ${idNuevo} con lo que llegó` : ''}.`,
  };
}

/** Rechazar: no cambia nada; guarda quién revisó y cuándo. */
async function rechazar(idError, idJefe) {
  return enTransaccion(async (cn) => {
    await pendienteParaRevisar(cn, idError);
    await errorRepo.cerrar(cn, idError, { estado: 'RECHAZADO', id_usuario_revisa: idJefe });
    return { mensaje: 'Registro rechazado: no se cambió nada.' };
  });
}

/**
 * CU16 · RF-12: panel de sedes. Por hospital: stock, uso diario, días que alcanza (rojo si 2 días o menos),
 * aviso si no registra consumo en más de 12 horas y sus pendientes.
 */
async function panelSedes(idSede = null) {
  const db = getPool();
  let hospitales = await sedeRepo.listar(db, { soloActivas: true, tipo: 'HOSPITAL' });
  if (idSede) hospitales = hospitales.filter((h) => h.id_sede === idSede);
  const resultado = [];
  for (const h of hospitales) {
    const item = { sede: h, control_iniciado: !!h.fecha_inicio_control, filas: [], pendientes: 0, envios_pendientes: 0 };
    item.pendientes = await errorRepo.contarPendientes(db, h.id_sede);
    if (item.control_iniciado) {
      const consumo7 = await consumoRepo.consumoPorProductoDesde(db, h.id_sede, 7);
      item.filas = (await consumoRepo.stockSede(db, h.id_sede)).map((f) => stockSedeFila(f, consumo7.get(f.id_producto) || 0));
      const ultimo = await consumoRepo.ultimoConsumo(db, h.id_sede);
      item.ultimo_consumo = ultimo ? ultimo.fecha : null;
      item.sin_consumo_12h = !ultimo || ultimo.horas > 12;
      item.envios_pendientes = (await movimientoRepo.enviosPendientes(db, h.id_sede, h.fecha_inicio_control)).length;
    }
    resultado.push(item);
  }
  return resultado;
}

module.exports = { listar, aprobar, rechazar, panelSedes, RESOLUCIONES };
