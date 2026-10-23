// Panel de sedes y registro de errores del jefe (equivale a HospitalesController.java) · CU15, CU16 · solo JEFE
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta } = require('../util/errores');
const { idDe } = require('./catalogos');
const registroErrorService = require('../services/registroErrorService');

const router = express.Router();
const soloJefe = permitir('JEFE');

// GET /api/panel-sedes?sede=
router.get('/panel-sedes', soloJefe, ruta(async (req, res) => {
  res.json({ ok: true, sedes: await registroErrorService.panelSedes(Number(req.query.sede) || null) });
}));

// GET /api/errores?sede=&estado=
router.get('/errores', soloJefe, ruta(async (req, res) => {
  const estado = ['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(req.query.estado) ? req.query.estado : null;
  res.json({
    ok: true,
    errores: await registroErrorService.listar({ id_sede: Number(req.query.sede) || null, estado }),
    resoluciones: registroErrorService.RESOLUCIONES,
  });
}));

// PUT /api/errores/:id/aprobar  -> { resolucion: REGISTRO | PERDIDA } (la resolución solo en diferencias de envío)
router.put('/errores/:id/aprobar', soloJefe, ruta(async (req, res) => {
  res.json({ ok: true, ...(await registroErrorService.aprobar(idDe(req), req.usuario.id_usuario, req.body)) });
}));

// PUT /api/errores/:id/rechazar
router.put('/errores/:id/rechazar', soloJefe, ruta(async (req, res) => {
  res.json({ ok: true, ...(await registroErrorService.rechazar(idDe(req), req.usuario.id_usuario)) });
}));

module.exports = router;
