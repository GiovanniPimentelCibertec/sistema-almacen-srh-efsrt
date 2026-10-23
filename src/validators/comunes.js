// Validaciones comunes de los formularios
const MAXIMO_CANTIDAD = 1000000; // tope por renglón: evita errores de digitación (por ejemplo 99999999)

/** Convierte a número con hasta 2 decimales; devuelve null si está vacío o no es un número válido. */
function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100) / 100;
}

function entero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isInteger(n) ? n : NaN;
}

function texto(valor) {
  return valor === null || valor === undefined ? '' : String(valor).trim();
}

module.exports = { MAXIMO_CANTIDAD, numero, entero, texto };
