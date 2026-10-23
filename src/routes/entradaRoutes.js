// Entradas (equivale a EntradaController.java) · CU07 · RF-04 · JEFE y ASISTENTE
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta } = require('../util/errores');
const movimientoService = require('../services/movimientoService');

const router = express.Router();

// POST /api/movimientos/entrada
router.post('/entrada', permitir('JEFE', 'ASISTENTE'), ruta(async (req, res) => {
  res.status(201).json({ ok: true, ...(await movimientoService.registrarEntrada(req.usuario.id_usuario, req.body)) });
}));

module.exports = router;
