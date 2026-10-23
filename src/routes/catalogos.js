// Rutas comunes de un catálogo: listar, ver, crear, editar y activar o desactivar.
// No hay rutas DELETE (RN-10): desactivar es PUT /:id/estado.
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta, NegocioError } = require('../util/errores');

function idDe(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new NegocioError('Identificador no válido.', 404);
  return id;
}

/**
 * service: { listar, buscar, crear, editar, cambiarEstado }
 * rolesLectura: quién puede listar y ver; rolesEscritura: quién puede crear, editar y desactivar.
 */
function rutasCatalogo(service, { rolesLectura, rolesEscritura, clave }) {
  const router = express.Router();
  router.get('/', permitir(...rolesLectura), ruta(async (req, res) => {
    const soloActivos = req.query.activos === '1';
    res.json({ ok: true, [clave]: await service.listar({ soloActivas: soloActivos, soloActivos }) });
  }));
  router.get('/:id', permitir(...rolesLectura), ruta(async (req, res) => {
    res.json({ ok: true, item: await service.buscar(idDe(req)) });
  }));
  router.post('/', permitir(...rolesEscritura), ruta(async (req, res) => {
    res.status(201).json({ ok: true, ...(await service.crear(req.body, req.usuario.id_usuario)) });
  }));
  router.put('/:id', permitir(...rolesEscritura), ruta(async (req, res) => {
    res.json({ ok: true, ...(await service.editar(idDe(req), req.body, req.usuario.id_usuario)) });
  }));
  router.put('/:id/estado', permitir(...rolesEscritura), ruta(async (req, res) => {
    const activo = req.body.activo === true || req.body.activo === 1 || req.body.activo === '1';
    res.json({ ok: true, ...(await service.cambiarEstado(idDe(req), activo, req.usuario.id_usuario)) });
  }));
  return router;
}

module.exports = { rutasCatalogo, idDe };
