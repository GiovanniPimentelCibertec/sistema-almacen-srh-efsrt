// Entidad Usuario: tabla `usuario` (equivale a entity/Usuario.java)
module.exports = {
  tabla: 'usuario',
  id: 'id_usuario',
  ROLES: ['ADMINISTRADOR', 'JEFE', 'ASISTENTE', 'SEDE'],
  campos: {
  nombres: 'VARCHAR(100)',
  username: 'VARCHAR(40), único (RN-01)',
  password: 'hash bcrypt, nunca texto plano',
  rol: 'ADMINISTRADOR | JEFE | ASISTENTE | SEDE',
  id_sede: 'solo el rol SEDE lleva sede, y siempre la lleva',
  activo: '1 = puede entrar, 0 = bloqueado',
  },
};
