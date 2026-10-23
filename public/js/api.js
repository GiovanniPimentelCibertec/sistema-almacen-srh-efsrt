// Llamadas al servidor con fetch (JSON). Si la sesión venció, vuelve al login.
async function api(metodo, url, cuerpo) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  let res;
  try {
    res = await fetch(url, opciones);
  } catch (e) {
    throw Object.assign(new Error('No se pudo conectar con el servidor.'), { errores: ['No se pudo conectar con el servidor.'] });
  }
  if (res.status === 401 && !url.endsWith('/api/login')) {
    location.href = '/login';
    return new Promise(() => {});
  }
  const datos = await res.json().catch(() => ({ ok: false, errores: ['Respuesta no válida del servidor.'] }));
  if (!res.ok || datos.ok === false) {
    const errores = datos.errores || ['Ocurrió un error.'];
    throw Object.assign(new Error(errores.join(' ')), { errores, status: res.status, datos });
  }
  return datos;
}
