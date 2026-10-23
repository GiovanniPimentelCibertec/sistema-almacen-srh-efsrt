// Sedes (equivale a SedeController.java) · CU04 · ADMINISTRADOR (listar: también JEFE y ASISTENTE)
const { rutasCatalogo } = require('./catalogos');
const sedeService = require('../services/sedeService');

module.exports = rutasCatalogo(sedeService, {
  clave: 'sedes',
  rolesLectura: ['ADMINISTRADOR', 'JEFE', 'ASISTENTE'],
  rolesEscritura: ['ADMINISTRADOR'],
});
