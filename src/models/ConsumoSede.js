// Entidad ConsumoSede: tabla `consumo_sede` (equivale a entity/ConsumoSede.java)
module.exports = {
  tabla: 'consumo_sede',
  id: 'id_consumo',
  TIPOS: ['INICIAL', 'CONSUMO', 'AJUSTE'],
  TURNOS: ['MAÑANA', 'TARDE', 'NOCHE'],
  campos: {
  id_sede: 'hospital',
  id_producto: 'producto',
  id_usuario: 'encargado que registró',
  tipo: 'INICIAL | CONSUMO | AJUSTE',
  fecha: 'DATETIME',
  cantidad: 'INICIAL y CONSUMO > 0; AJUSTE distinto de 0',
  turno: 'MAÑANA | TARDE | NOCHE (solo en CONSUMO)',
  motivo: 'texto libre (por ejemplo, «Conteo de verificación»)',
  estado: 'ACTIVO | ANULADO',
  },
};
