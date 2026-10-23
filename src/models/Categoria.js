// Entidad Categoria: tabla `categoria` (equivale a entity/Categoria.java)
module.exports = {
  tabla: 'categoria',
  id: 'id_categoria',
  campos: {
  nombre: 'VARCHAR(60), único',
  activo: '1 = activo, 0 = desactivado (nada se borra, RN-10)',
  },
};
