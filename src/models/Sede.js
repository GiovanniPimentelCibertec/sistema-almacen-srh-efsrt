// Entidad Sede: tabla `sede` (equivale a entity/Sede.java)
module.exports = {
  tabla: 'sede',
  id: 'id_sede',
  TIPOS: ['PLANTA', 'HOSPITAL'],
  campos: {
  nombre: 'VARCHAR(80), único',
  tipo: 'PLANTA | HOSPITAL',
  fecha_inicio_control: 'DATE; se llena con el conteo inicial del hospital',
  activo: '1 = activo, 0 = desactivado',
  },
};
