// Historial y detalle de movimientos (equivale a MovimientoControllerBase.java) · JEFE y ASISTENTE
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta } = require('../util/errores');
const { idDe } = require('./catalogos');
const movimientoService = require('../services/movimientoService');

const router = express.Router();
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

// GET /api/movimientos?tipo=&sede=&desde=&hasta=
router.get('/', permitir('JEFE', 'ASISTENTE'), ruta(async (req, res) => {
  const tipo = ['ENTRADA', 'SALIDA', 'AJUSTE'].includes(req.query.tipo) ? req.query.tipo : null;
  const movimientos = await movimientoService.listar({
    tipo, id_sede: Number(req.query.sede) || null, desde: fecha(req.query.desde), hasta: fecha(req.query.hasta),
  });
  res.json({ ok: true, movimientos });
}));

// GET /api/movimientos/:id (cabecera y productos)
router.get('/:id', permitir('JEFE', 'ASISTENTE'), ruta(async (req, res) => {
  res.json({ ok: true, movimiento: await movimientoService.buscarConDetalle(idDe(req)) });
}));

module.exports = router;
