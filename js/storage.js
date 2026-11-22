/** Almacenamiento local con protección (modo privado, cuota llena, etc.). */

const PREFIJO = "animaminas.v1.";

export function leer(clave, porDefecto = null) {
  try {
    const bruto = localStorage.getItem(PREFIJO + clave);
    return bruto === null ? porDefecto : JSON.parse(bruto);
  } catch {
    return porDefecto;
  }
}

export function escribir(clave, valor) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function borrar(clave) {
  try {
    localStorage.removeItem(PREFIJO + clave);
  } catch {
    /* sin almacenamiento disponible */
  }
}
