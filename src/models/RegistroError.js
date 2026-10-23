// Entidad RegistroError: tabla `registro_error` (equivale a entity/RegistroError.java)
module.exports = {
  tabla: 'registro_error',
  id: 'id_error',
  ACCIONES: ['CORREGIR', 'ANULAR', 'DIFERENCIA'],
  MOTIVOS: ['DIGITACION', 'DUPLICADO', 'PRODUCTO', 'ENVIO', 'OTRO'],
  ESTADOS: ['PENDIENTE', 'APROBADO', 'RECHAZADO'],
  campos: {
  id_consumo: 'registro de la sede corregido o anulado',
  id_movimiento: 'envío con diferencia',
  accion: 'CORREGIR | ANULAR | DIFERENCIA',
  valor_anterior: 'cantidad antes',
  valor_nuevo: 'cantidad después (NULL al anular)',
  motivo: 'DIGITACION | DUPLICADO | PRODUCTO | ENVIO | OTRO',
  detalle: 'explicación; en una diferencia empieza con el código del producto',
  id_usuario_reporta: 'quién lo reportó',
  id_usuario_revisa: 'jefe que lo revisó',
  fecha_reporte: 'DATETIME',
  fecha_revision: 'DATETIME',
  estado: 'PENDIENTE | APROBADO | RECHAZADO',
  },
};
