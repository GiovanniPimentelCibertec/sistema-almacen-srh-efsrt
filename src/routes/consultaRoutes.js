// Consultas: kardex y stock actual (equivale a ConsultaController.java) · CU10 · RF-07 · JEFE y ASISTENTE
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta, NegocioError } = require('../util/errores');
const movimientoService = require('../services/movimientoService');

const router = express.Router();
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

// GET /api/kardex?producto=&desde=&hasta=
router.get('/kardex', permitir('JEFE', 'ASISTENTE'), ruta(async (req, res) => {
  const idProducto = Number(req.query.producto);
  if (!Number.isInteger(idProducto) || idProducto < 1) throw new NegocioError('Elija el producto.');
  if (!esFecha(req.query.desde) || !esFecha(req.query.hasta)) throw new NegocioError('Elija el rango de fechas.');
  res.json({ ok: true, ...(await movimientoService.kardex(idProducto, req.query.desde, req.query.hasta)) });
}));

// GET /api/stock?categoria=&situacion=
router.get('/stock', permitir('JEFE', 'ASISTENTE'), ruta(async (req, res) => {
  const situacion = ['OK', 'REPONER'].includes(req.query.situacion) ? req.query.situacion : null;
  res.json({ ok: true, productos: await movimientoService.stock({ categoria: req.query.categoria || null, situacion }) });
}));

module.exports = router;
