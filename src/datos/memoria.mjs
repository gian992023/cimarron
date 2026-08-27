// Implementación en memoria del contrato de datos.
//
// Es la que corre en la demo: cero dependencias externas, cero latencia, cero
// riesgo de que una caída de red mate la presentación. Los datos salen de
// src/datos/semillas.mjs (el archivo que se edita con la información real).
//
// Al arrancar, emite el Sello Llanero de los ítems que traen `certificacion`
// en las semillas, así el verificador tiene cadena real desde el segundo cero.

import { NEGOCIOS, ITEMS } from './semillas.mjs';
import { generarId } from '../nucleo/id.mjs';
import { emitirSello, raizDeCadena } from '../nucleo/sello.mjs';

const ahora = () => new Date().toISOString();

export function crearRepositorioMemoria() {
  const negocios = JSON.parse(JSON.stringify(NEGOCIOS)).map((n) => ({ activo: true, ...n }));
  const items = JSON.parse(JSON.stringify(ITEMS)).map((i) => ({
    activo: true,
    codigoSello: null,
    ...i,
  }));
  const solicitudes = [];
  const sellos = [];
  let consecutivo = 1000;

  const clon = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);
  const coincide = (texto, b) =>
    !b || String(texto || '').toLowerCase().includes(String(b).toLowerCase());
  const negocioDe = (id) => negocios.find((n) => n.id === id);

  const enriquecer = (item) => {
    const n = negocioDe(item.negocioId);
    return clon({
      ...item,
      negocioNombre: n?.nombre,
      municipio: n?.municipio,
      sector: n?.sector,
      radioCoberturaKm: n?.radioCoberturaKm ?? 0,
    });
  };

  // ----- sellos de las semillas: cadena real desde el arranque -----
  for (const item of items) {
    if (!item.certificacion) continue;
    const n = negocioDe(item.negocioId);
    const sello = emitirSello(
      {
        producto: item.nombre,
        negocio: n?.nombre,
        municipio: n?.municipio,
        ...item.certificacion,
      },
      raizDeCadena(sellos),
    );
    sellos.push(sello);
    item.codigoSello = sello.codigo;
    delete item.certificacion;
  }

  return {
    // ----- negocios -----
    async listarNegocios(filtro = {}) {
      return clon(
        negocios.filter(
          (n) =>
            n.activo &&
            (!filtro.sector || n.sector === filtro.sector) &&
            (coincide(n.nombre, filtro.busqueda) ||
              coincide(n.descripcion, filtro.busqueda) ||
              coincide(n.municipio, filtro.busqueda)),
        ),
      );
    },

    async obtenerNegocio(id) {
      return clon(negocioDe(id) ?? null);
    },

    async crearNegocio(datos) {
      const negocio = { id: generarId('neg'), activo: true, radioCoberturaKm: 10, ...datos };
      negocios.push(negocio);
      return clon(negocio);
    },

    // ----- items -----
    async listarItems(filtro = {}) {
      const porSector = filtro.sector
        ? new Set(negocios.filter((n) => n.sector === filtro.sector).map((n) => n.id))
        : null;

      return items
        .filter(
          (i) =>
            i.activo &&
            (!filtro.negocioId || i.negocioId === filtro.negocioId) &&
            (!filtro.tipo || i.tipo === filtro.tipo) &&
            (!filtro.categoria || i.categoria === filtro.categoria) &&
            (!porSector || porSector.has(i.negocioId)) &&
            (coincide(i.nombre, filtro.busqueda) ||
              coincide(i.descripcion, filtro.busqueda) ||
              coincide(i.categoria, filtro.busqueda)),
        )
        .map(enriquecer);
    },

    async obtenerItem(id) {
      const i = items.find((x) => x.id === id);
      return i ? enriquecer(i) : null;
    },

    async crearItem(datos) {
      const item = { id: generarId('itm'), activo: true, codigoSello: null, ...datos };
      items.push(item);
      return enriquecer(item);
    },

    async actualizarItem(id, cambios) {
      const i = items.find((x) => x.id === id);
      if (!i) throw new Error(`Ítem no encontrado: ${id}`);
      Object.assign(i, cambios);
      return enriquecer(i);
    },

    // ----- solicitudes -----
    async crearSolicitud(datos) {
      const solicitud = {
        id: generarId('sol'),
        numero: ++consecutivo,
        pagado: false,
        creadoEn: ahora(),
        ...datos,
      };
      solicitudes.push(solicitud);
      return clon(solicitud);
    },

    async obtenerSolicitud(id) {
      return clon(
        solicitudes.find((s) => s.id === id || String(s.numero) === String(id)) ?? null,
      );
    },

    async actualizarSolicitud(id, cambios) {
      const s = solicitudes.find((x) => x.id === id || String(x.numero) === String(id));
      if (!s) throw new Error(`Solicitud no encontrada: ${id}`);
      Object.assign(s, cambios);
      return clon(s);
    },

    async listarSolicitudes(filtro = {}) {
      return solicitudes
        .filter(
          (s) =>
            (!filtro.telefono || s.telefono === String(filtro.telefono).trim()) &&
            (!filtro.negocioId || s.negocioId === filtro.negocioId),
        )
        .map((s) => {
          const item = items.find((i) => i.id === s.itemId);
          const n = negocioDe(s.negocioId);
          return clon({ ...s, itemNombre: item?.nombre, negocioNombre: n?.nombre });
        })
        .reverse();
    },

    // ----- sellos (cadena de hashes) -----
    async listarSellos() {
      return clon(sellos);
    },

    async obtenerSello(codigo) {
      return clon(sellos.find((s) => s.codigo === String(codigo).toUpperCase()) ?? null);
    },

    async guardarSello(sello) {
      sellos.push(sello);
      return clon(sello);
    },
  };
}
