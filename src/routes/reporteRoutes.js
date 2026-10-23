// Reportes (equivale a ReporteController.java) · CU11 · RF-08 · solo JEFE
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta } = require('../util/errores');
const reporteService = require('../services/reporteService');

const router = express.Router();
router.use(permitir('JEFE'));

// GET /api/reportes/consumo-sede-mes?mes=AAAA-MM&sede=
router.get('/consumo-sede-mes', ruta(async (req, res) => {
  res.json({ ok: true, ...(await reporteService.consumoSedeMes({ mes: req.query.mes || null, sede: req.query.sede || null })) });
}));

// GET /api/reportes/bajo-minimo
router.get('/bajo-minimo', ruta(async (req, res) => {
  res.json({ ok: true, productos: await reporteService.bajoMinimo() });
}));

module.exports = router;
