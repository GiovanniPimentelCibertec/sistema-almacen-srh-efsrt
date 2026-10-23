// Entidad Marca: tabla `marca` (equivale a entity/Marca.java)
module.exports = {
  tabla: 'marca',
  id: 'id_marca',
  campos: {
  nombre: 'VARCHAR(60), único',
  activo: '1 = activo, 0 = desactivado (nada se borra, RN-10)',
  },
};
