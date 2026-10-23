// Sesión y permisos por rol (equivale a SecurityConfig.java).
// La pantalla oculta las opciones de otros roles, pero el bloqueo real se hace aquí, en el servidor.
const session = require('express-session');

const ROLES = ['ADMINISTRADOR', 'JEFE', 'ASISTENTE', 'SEDE'];

function sesion() {
  return session({
    name: 'srh.sid',
    secret: process.env.SESSION_SECRET || 'srh-almacen-secreto-de-desarrollo',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }, // un turno de 8 horas
  });
}

/** Usuario que inició sesión, o null. */
function usuarioActual(req) {
  return (req.session && req.session.usuario) || null;
}

/**
 * Middleware de las rutas /api: permitir('JEFE', 'ASISTENTE').
 * Sin sesión responde 401; con otro rol responde 403 «No tienes permiso».
 */
function permitir(...roles) {
  return (req, res, next) => {
    const u = usuarioActual(req);
    if (!u) return res.status(401).json({ ok: false, errores: ['Inicie sesión para continuar.'] });
    if (roles.length && !roles.includes(u.rol)) {
      return res.status(403).json({ ok: false, errores: ['No tienes permiso para esta opción.'] });
    }
    req.usuario = u;
    next();
  };
}

module.exports = { ROLES, sesion, usuarioActual, permitir };
