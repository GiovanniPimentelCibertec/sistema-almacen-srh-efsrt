// Menú superior, mensajes y utilidades comunes (equivale a templates/fragments/layout.html).
// El menú se arma con el rol que devuelve GET /api/me: ocultar opciones es comodidad,
// el bloqueo real lo hace el servidor.
const MENU = {
  ADMINISTRADOR: [['/', 'Inicio'], ['/usuarios', 'Usuarios'], ['/sedes', 'Sedes'], ['/categorias', 'Categorías']],
  JEFE: [['/', 'Inicio'], ['/productos', 'Productos'], ['/marcas', 'Marcas'], ['/entradas', 'Entradas'], ['/salidas', 'Salidas'],
    ['/ajustes', 'Ajustes'], ['/kardex', 'Kardex'], ['/stock', 'Stock'], ['/movimientos', 'Historial'],
    ['/hospitales', 'Panel de sedes'], ['/errores', 'Errores'], ['/reportes', 'Reportes']],
  ASISTENTE: [['/', 'Inicio'], ['/productos', 'Productos'], ['/entradas', 'Entradas'], ['/salidas', 'Salidas'],
    ['/kardex', 'Kardex'], ['/stock', 'Stock'], ['/movimientos', 'Historial']],
  SEDE: [['/sede', 'Mi sede'], ['/sede/consumo', 'Registrar consumo'], ['/sede/verificacion', 'Conteo'], ['/sede/registros', 'Mis registros']],
};
const ROL_TEXTO = { ADMINISTRADOR: 'ADMINISTRADOR', JEFE: 'JEFE', ASISTENTE: 'ASISTENTE', SEDE: 'SEDE' };

/** Escapa texto para insertarlo en HTML. */
function h(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const $ = (sel) => document.querySelector(sel);
const num = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('es-PE', { maximumFractionDigits: 2 }));
const fecha = (f) => (f ? f.slice(0, 16).replace('T', ' ') : '');
const fechaCorta = (f) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '');
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const haceDias = (d) => new Date(Date.now() - d * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const param = (nombre) => new URLSearchParams(location.search).get(nombre);
/** Último número de la URL: /productos/editar/5 -> 5 */
const idDeUrl = () => { const m = location.pathname.match(/\/(\d+)\/?$/); return m ? Number(m[1]) : null; };

let usuarioActual = null;

/** Arma el menú, marca la opción actual y devuelve el usuario de la sesión. */
async function iniciarPagina() {
  const { usuario } = await api('GET', '/api/me');
  usuarioActual = usuario;
  const menu = $('#menu');
  if (menu) {
    const opciones = (MENU[usuario.rol] || []).map(([url, texto]) => {
      const activo = url === location.pathname || (url !== '/' && url !== '/sede' && location.pathname.startsWith(url + '/'));
      return `<a href="${url}"${activo ? ' class="activo"' : ''}>${h(texto)}</a>`;
    }).join('');
    menu.className = 'menu';
    menu.innerHTML = `
      <a href="${usuario.rol === 'SEDE' ? '/sede' : '/'}" class="marca">📦 Almacén SRH</a>
      <nav>${opciones}</nav>
      <div class="usuario">
        <span class="nombre">${h(usuario.username)}${usuario.sede ? ' · ' + h(usuario.sede) : ''}</span>
        <span class="rol">${h(ROL_TEXTO[usuario.rol])}</span>
        <button type="button" class="btn-salir" id="btn-salir">Cerrar sesión</button>
      </div>`;
    $('#btn-salir').addEventListener('click', async () => {
      await api('POST', '/api/logout');
      location.href = '/login';
    });
  }
  return usuario;
}

/** Muestra un mensaje de éxito o de error en el contenedor #mensajes. */
function mensaje(texto, tipo = 'ok') {
  const caja = $('#mensajes');
  if (!caja) return alert(Array.isArray(texto) ? texto.join('\n') : texto);
  const lista = Array.isArray(texto) ? texto : [texto];
  caja.innerHTML = lista.length > 1
    ? `<div class="alerta ${tipo}"><ul>${lista.map((t) => `<li>${h(t)}</li>`).join('')}</ul></div>`
    : `<div class="alerta ${tipo}">${h(lista[0])}</div>`;
  caja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
const mostrarError = (e) => mensaje(e.errores || [e.message], 'error');
const limpiarMensaje = () => { const c = $('#mensajes'); if (c) c.innerHTML = ''; };

/** Mensaje que sobrevive a una redirección (por ejemplo, después de guardar y volver a la lista). */
function mensajeSiguiente(texto) { sessionStorage.setItem('mensaje', texto); }
function mostrarMensajePendiente() {
  const t = sessionStorage.getItem('mensaje');
  if (t) { sessionStorage.removeItem('mensaje'); mensaje(t); }
}

/** Llena un <select> con opciones. */
function llenarSelect(select, filas, valor, texto, vacio = 'Seleccione...') {
  select.innerHTML = (vacio ? `<option value="">${h(vacio)}</option>` : '') +
    filas.map((f) => `<option value="${h(f[valor])}">${h(typeof texto === 'function' ? texto(f) : f[texto])}</option>`).join('');
}

/** Ejecuta la carga de la página mostrando los errores en pantalla. */
function alCargar(fn) {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await fn();
      mostrarMensajePendiente();
    } catch (e) {
      mostrarError(e);
    }
  });
}

/** Desactiva el botón mientras se guarda (evita registrar dos veces). */
async function conBoton(boton, fn) {
  boton.disabled = true;
  try { return await fn(); } finally { boton.disabled = false; }
}
