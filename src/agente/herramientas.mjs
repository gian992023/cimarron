// Las herramientas del agente.
//
// PATRÓN TOMADO DE PETRASERVIS: definición declarativa + un único despachador.
// Cada herramienta llama a la MISMA capa de servicios que usan los endpoints
// REST de la web (src/servicios/flujo.mjs): el agente y la interfaz nunca se
// desincronizan, y el modelo no puede inventar precios, cupos ni sellos.

import { repositorio } from '../datos/index.mjs';
import { resolverLugar } from '../nucleo/geocerca.mjs';
import { formatearCOP, formatearDistanciaKm } from '../nucleo/formato.mjs';
import {
  catalogo,
  cobertura,
  crearSolicitudCompleta,
  instruccionPagoBreB,
  certificarItem,
  verificarSelloCompleto,
} from '../servicios/flujo.mjs';

const SECTORES = ['comercio', 'turismo', 'agro'];

/* ------------------------------------------------------------------ */
/* Definiciones que ve el modelo                                       */
/* ------------------------------------------------------------------ */

export const HERRAMIENTAS = [
  {
    name: 'consultar_catalogo',
    description:
      'Lista productos y servicios reales del catálogo con su precio real en COP, el negocio, el sector ' +
      'y el flujo que les corresponde (pedido, reserva o agendamiento). Úsala SIEMPRE antes de mencionar ' +
      'un ítem o un precio. Nunca los inventes.',
    input_schema: {
      type: 'object',
      properties: {
        busqueda: { type: 'string', description: 'Texto libre: matchea nombre del ítem, descripción, categoría, y también el nombre y municipio del negocio' },
        sector: { type: 'string', enum: SECTORES },
        tipo: { type: 'string', enum: ['producto', 'servicio'] },
        categoria: { type: 'string', description: 'Categoría del sector (restaurantes, alojamiento, ferreterías, insumos...)' },
        municipio: { type: 'string', description: 'Filtra por municipio de Casanare (Yopal, Aguazul, Villanueva...)' },
        negocio_id: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'registrar_negocio',
    description:
      'Registra un negocio no petrolero de Casanare a partir de lo que la persona cuenta hablando. ' +
      'Sector: comercio (tiendas y oficios), turismo (alojamiento, planes) o agro (insumos y servicios de campo). ' +
      'No pidas coordenadas: pasa el municipio o barrio y el sistema lo resuelve.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        sector: { type: 'string', enum: SECTORES },
        responsable: { type: 'string' },
        municipio: { type: 'string' },
        telefono: { type: 'string' },
        descripcion: { type: 'string', description: 'Qué hace el negocio, en una frase' },
        radio_cobertura_km: {
          type: 'number',
          description:
            'Hasta dónde entrega (comercio) o hasta dónde va el servicio de campo (agro). 0 si el cliente siempre va al sitio (turismo).',
        },
      },
      required: ['nombre', 'sector', 'responsable', 'municipio'],
    },
  },
  {
    name: 'publicar_item',
    description:
      'Publica un producto o servicio en el catálogo de un negocio ya registrado. TÚ redactas la ' +
      'descripción comercial a partir de lo que la persona contó: ese es tu aporte, porque el productor ' +
      'no sabe redactar para vender. En servicios indica la modalidad: en_sitio (el cliente va) o ' +
      'a_domicilio (el negocio va a la casa o finca del cliente).',
    input_schema: {
      type: 'object',
      properties: {
        negocio_id: { type: 'string' },
        tipo: { type: 'string', enum: ['producto', 'servicio'] },
        nombre: { type: 'string' },
        precio_cop: { type: 'integer' },
        descripcion: { type: 'string', description: 'La descripción comercial que TÚ redactaste' },
        unidad: {
          type: 'string',
          enum: ['unidad', 'porcion', 'libra', 'kg', 'bulto', 'litro', 'persona', 'noche', 'hectarea', 'animal', 'visita', 'servicio'],
        },
        categoria: { type: 'string' },
        modalidad: { type: 'string', enum: ['en_sitio', 'a_domicilio'], description: 'Solo para servicios' },
        dias_elaboracion: { type: 'integer' },
      },
      required: ['negocio_id', 'tipo', 'nombre', 'precio_cop', 'descripcion', 'unidad', 'categoria'],
    },
  },
  {
    name: 'evaluar_cobertura',
    description:
      'Calcula con Haversine si un lugar está dentro del radio de cobertura del negocio (domicilio en ' +
      'comercio, servicio de campo en agro). Úsala SIEMPRE antes de prometer una entrega o una visita.',
    input_schema: {
      type: 'object',
      properties: {
        negocio_id: { type: 'string' },
        lugar: { type: 'string', description: 'Barrio, vereda o municipio, como lo dijo la persona' },
      },
      required: ['negocio_id', 'lugar'],
    },
  },
  {
    name: 'crear_solicitud',
    description:
      'Crea la solicitud correcta según el ítem: PEDIDO para productos (requiere lugar de entrega), ' +
      'RESERVA para servicios de turismo (requiere fecha_inicio, y fecha_fin si es alojamiento), ' +
      'AGENDAMIENTO para servicios agro (requiere fecha, y lugar_servicio si es a domicilio). ' +
      'Devuelve el número de solicitud, el total y la instrucción de pago Bre-B.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        cantidad: { type: 'integer', minimum: 1, description: 'Según la unidad: unidades, noches, personas, hectáreas, animales...' },
        cliente: { type: 'string' },
        telefono: { type: 'string', description: 'Solo dígitos, para seguimiento' },
        lugar: { type: 'string', description: 'Pedidos: barrio o municipio de entrega' },
        fecha_inicio: { type: 'string', description: 'Reservas: AAAA-MM-DD' },
        fecha_fin: { type: 'string', description: 'Reservas de alojamiento: AAAA-MM-DD' },
        personas: { type: 'integer', description: 'Reservas: cuántas personas' },
        fecha: { type: 'string', description: 'Agendamientos: AAAA-MM-DD' },
        lugar_servicio: { type: 'string', description: 'Agendamientos a domicilio: finca, vereda o municipio' },
      },
      required: ['item_id', 'cantidad', 'cliente', 'telefono'],
    },
  },
  {
    name: 'generar_pago_breb',
    description:
      'Devuelve la instrucción de pago Bre-B de una solicitud ya creada: llave, QR, monto exacto y ' +
      'referencia única. El cliente escanea desde Nequi, Bancolombia o cualquier banco.',
    input_schema: {
      type: 'object',
      properties: { solicitud_id: { type: 'string', description: 'Id o número de la solicitud' } },
      required: ['solicitud_id'],
    },
  },
  {
    name: 'certificar_origen',
    description:
      'Emite el Sello Llanero de un ítem: lo encadena criptográficamente al último sello y devuelve un ' +
      'código verificable. Es la certificación de origen, autenticidad cultural o sostenibilidad. ' +
      'Llámala cuando el productor haya contado el origen, la técnica y los materiales o la práctica sostenible.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        origen: { type: 'string', description: 'Vereda, finca, hato o comunidad de origen' },
        tecnica: { type: 'string' },
        materiales: { type: 'string' },
        sostenibilidad: { type: 'string' },
      },
      required: ['item_id', 'origen'],
    },
  },
  {
    name: 'verificar_sello',
    description:
      'Verifica un código de Sello Llanero: recalcula su hash y valida el encadenamiento completo. ' +
      'Dice si el registro fue alterado después de emitirse. Es pública.',
    input_schema: {
      type: 'object',
      properties: { codigo: { type: 'string', description: 'Formato LLA-XXXXXX' } },
      required: ['codigo'],
    },
  },
  {
    name: 'generar_contenido_promo',
    description:
      'Empaqueta el texto promocional que TÚ redactaste: agrega el sello si existe, los hashtags y el ' +
      'enlace de WhatsApp listo para compartir. Redacta tú el post; esta herramienta solo lo arma.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        texto: { type: 'string', description: 'El post que TÚ escribiste' },
        hashtags: { type: 'array', items: { type: 'string' } },
      },
      required: ['item_id', 'texto'],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

export async function ejecutarHerramienta(nombre, entrada) {
  const db = repositorio();

  try {
    switch (nombre) {
      case 'consultar_catalogo': {
        const base = {
          busqueda: entrada.busqueda,
          sector: entrada.sector,
          tipo: entrada.tipo,
          categoria: entrada.categoria,
          municipio: entrada.municipio,
          negocioId: entrada.negocio_id,
        };
        let items = await catalogo(base);
        let nota = null;
        // Fallback: si no hubo resultados, relaja filtros en cascada para no
        // dejar al usuario sin opciones (robusto ante consultas muy estrechas).
        if (items.length === 0) {
          const intentos = [
            { ...base, categoria: undefined },
            { ...base, categoria: undefined, busqueda: undefined },
            { sector: entrada.sector, municipio: entrada.municipio },
            { sector: entrada.sector },
            { municipio: entrada.municipio },
          ];
          for (const f of intentos) {
            if (Object.values(f).every((v) => !v)) continue;
            items = await catalogo(f);
            if (items.length) {
              nota = 'No hubo coincidencia exacta con ese filtro; te muestro opciones cercanas (mismo sector o municipio). Menciónalas con naturalidad.';
              break;
            }
          }
        }
        items = items.slice(0, 40); // tope para no saturar el contexto del modelo
        return {
          ...(nota ? { nota_para_ti: nota } : {}),
          encontrados: items.length,
          items: items.map((i) => ({
            item_id: i.id,
            nombre: i.nombre,
            tipo: i.tipo,
            modalidad: i.modalidad ?? null,
            precio: i.precio,
            precio_cop: i.precioCop,
            unidad: i.unidad,
            categoria: i.categoria,
            flujo: i.flujo,
            descripcion: i.descripcion,
            negocio: i.negocioNombre,
            negocio_id: i.negocioId,
            municipio: i.municipio,
            sector: i.sector,
            sello: i.codigoSello ?? 'sin certificar',
          })),
        };
      }

      case 'registrar_negocio': {
        const lugar = resolverLugar(entrada.municipio);
        if (!lugar) {
          return {
            error: 'No reconozco ese lugar en Casanare.',
            sugerencia: 'Pregunta el municipio o el barrio y vuelve a intentar.',
          };
        }
        const negocio = await db.crearNegocio({
          nombre: entrada.nombre,
          sector: entrada.sector,
          responsable: entrada.responsable,
          municipio: entrada.municipio,
          telefono: entrada.telefono ?? null,
          descripcion: entrada.descripcion ?? null,
          ubicacion: { lat: lugar.lat, lng: lugar.lng },
          radioCoberturaKm: entrada.radio_cobertura_km ?? (entrada.sector === 'turismo' ? 0 : 10),
        });
        return {
          ok: true,
          negocio_id: negocio.id,
          nombre: negocio.nombre,
          sector: negocio.sector,
          municipio: negocio.municipio,
          radio_cobertura_km: negocio.radioCoberturaKm,
          siguiente_paso: 'Pregúntale qué vende o qué servicio presta para publicar su primer ítem.',
        };
      }

      case 'publicar_item': {
        const negocio = await db.obtenerNegocio(entrada.negocio_id);
        if (!negocio) return { error: 'Ese negocio no existe. Regístralo primero.' };
        if (entrada.tipo === 'servicio' && !entrada.modalidad) {
          return { error: 'Para un servicio indica la modalidad: en_sitio o a_domicilio.' };
        }
        const item = await db.crearItem({
          negocioId: entrada.negocio_id,
          tipo: entrada.tipo,
          nombre: entrada.nombre,
          precioCop: Math.round(entrada.precio_cop),
          descripcion: entrada.descripcion,
          unidad: entrada.unidad,
          categoria: entrada.categoria,
          modalidad: entrada.tipo === 'servicio' ? entrada.modalidad : undefined,
          diasElaboracion: entrada.dias_elaboracion ?? null,
        });
        return {
          ok: true,
          item_id: item.id,
          nombre: item.nombre,
          tipo: item.tipo,
          precio: formatearCOP(item.precioCop),
          negocio: negocio.nombre,
          siguiente_paso:
            'Si es artesanía, producto de finca o experiencia cultural, ofrécele el Sello Llanero.',
        };
      }

      case 'evaluar_cobertura': {
        const r = await cobertura(entrada.negocio_id, entrada.lugar);
        if (r.error) return r;
        return {
          dentro_de_cobertura: r.dentro,
          distancia: r.distancia,
          distancia_km: r.distanciaKm,
          radio_del_negocio_km: r.radioKm,
          referencia_reconocida: r.referencia,
          nota: r.dentro
            ? 'Hay cobertura.'
            : 'Fuera del radio: ofrece recoger en el punto (pedidos) o visita sujeta a coordinación (servicios).',
        };
      }

      case 'crear_solicitud': {
        const r = await crearSolicitudCompleta({
          itemId: entrada.item_id,
          cantidad: entrada.cantidad,
          cliente: entrada.cliente,
          telefono: entrada.telefono,
          lugar: entrada.lugar,
          fechaInicio: entrada.fecha_inicio,
          fechaFin: entrada.fecha_fin,
          personas: entrada.personas,
          fecha: entrada.fecha,
          lugarServicio: entrada.lugar_servicio,
        });
        if (r.error) return r;
        return {
          ok: true,
          tipo: r.solicitud.tipo,
          solicitud_id: r.solicitud.id,
          numero: r.solicitud.numeroLegible,
          item: r.solicitud.itemNombre,
          negocio: r.solicitud.negocioNombre,
          cantidad: r.solicitud.cantidad,
          total: r.solicitud.total,
          avisos: r.avisos,
          pago: r.pago,
          nota_para_ti:
            'Entrega el número de solicitud, el total, la instrucción de pago Bre-B con su referencia, y los avisos si los hay.',
        };
      }

      case 'generar_pago_breb': {
        const pago = await instruccionPagoBreB(entrada.solicitud_id);
        if (pago.error) return pago;
        return { ok: true, ...pago };
      }

      case 'certificar_origen': {
        const r = await certificarItem(entrada.item_id, {
          origen: entrada.origen,
          tecnica: entrada.tecnica,
          materiales: entrada.materiales,
          sostenibilidad: entrada.sostenibilidad,
        });
        if (r.error) return r;
        if (r.yaCertificado) {
          return { ya_certificado: true, codigo: r.codigo, nota: 'Entrega el código existente.' };
        }
        return {
          ok: true,
          codigo: r.codigo,
          hash: r.hash,
          posicion_en_la_cadena: r.posicion,
          es_el_primero: r.esElPrimero,
          explicacion:
            'El sello guarda el hash del anterior: si alguien altera un registro, rompe todos los ' +
            'siguientes y la manipulación queda a la vista.',
        };
      }

      case 'verificar_sello': {
        return await verificarSelloCompleto(entrada.codigo);
      }

      case 'generar_contenido_promo': {
        const item = await db.obtenerItem(entrada.item_id);
        if (!item) return { error: 'Ese ítem no existe.' };

        const etiquetas = (entrada.hashtags?.length
          ? entrada.hashtags
          : ['Casanare', 'HechoEnElLlano', 'CasanareDiversifica']
        )
          .map((h) => `#${String(h).replace(/^#/, '').replace(/\s+/g, '')}`)
          .join(' ');

        const sello = item.codigoSello ? `\n\nSello Llanero: ${item.codigoSello} (verificable)` : '';
        const post = `${entrada.texto}${sello}\n\n${etiquetas}`;
        const soporte = process.env.WHATSAPP_SOPORTE || '';

        return {
          ok: true,
          item: item.nombre,
          negocio: item.negocioNombre,
          precio: formatearCOP(item.precioCop),
          post_para_redes: post,
          enlace_whatsapp: `https://wa.me/?text=${encodeURIComponent(post)}`,
          enlace_soporte: soporte ? `https://wa.me/${soporte}` : null,
          canales_sugeridos: ['WhatsApp Estados', 'Facebook Marketplace', 'Instagram'],
          nota_para_ti: 'Muéstrale el post completo para que lo apruebe antes de publicar.',
        };
      }

      default:
        return { error: `Herramienta desconocida: ${nombre}` };
    }
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}
