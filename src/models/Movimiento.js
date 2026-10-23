// Entidad Movimiento: tabla `movimiento` (equivale a entity/Movimiento.java)
module.exports = {
  tabla: 'movimiento',
  id: 'id_movimiento',
  TIPOS: ['ENTRADA', 'SALIDA', 'AJUSTE'],
  campos: {
  tipo: 'ENTRADA | SALIDA | AJUSTE (RN-03)',
  fecha: 'DATETIME',
  observacion: 'guía de remisión o motivo del ajuste',
  id_usuario: 'quién lo registró',
  id_sede: 'solo en SALIDA',
  estado: 'ACTIVO | ANULADO',
  confirmado_sede: 'NULL = pendiente | CONFORME | DIFERENTE',
  },
};
