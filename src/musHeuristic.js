/**
 * musHeuristic.js
 * ===============
 * Port de mus_heuristic.py a JavaScript.
 * Política heurística para el bot de mus.
 *
 * Uso en Mus.jsx:
 *   import { heuristicDecide } from './musHeuristic.js';
 *   const accion = heuristicDecide(gameState);
 *
 * gameState debe tener:
 *   mano          — array de {palo, valor}
 *   fase          — string ('mus', 'descarte', 'grande', etc.)
 *   faseApuesta   — string ('grande', 'chica', 'pares', 'juego', 'punto')
 *   esMano        — bool
 *   scoreSelf     — int
 *   scoreOpp      — int
 *   apuestaAbierta — null | {cantidad, quien}
 *   declaracionOpp — null | 'si' | 'no'
 *   cartasSeleccionadas — array de índices
 */

// ── CONSTANTES DE ACCIONES (deben coincidir con mus_env.py) ──────────────────

export const ACT_MUS         = 0;
export const ACT_NO_HAY_MUS  = 1;
export const ACT_DESCARTAR   = 2;
export const ACT_PASO        = 3;
export const ACT_ENVIDO_2    = 4;
export const ACT_ENVIDO_4    = 5;
export const ACT_ORDAGO      = 6;
export const ACT_QUIERO      = 7;
export const ACT_NO_QUIERO   = 8;
export const ACT_SUBIR       = 9;
export const ACT_DECLARAR_SI = 10;
export const ACT_DECLARAR_NO = 11;
export const ACT_SEL_CARTA_0 = 12;
export const ACT_SEL_CARTA_1 = 13;
export const ACT_SEL_CARTA_2 = 14;
export const ACT_SEL_CARTA_3 = 15;

export const ACTION_NAMES = {
  [ACT_MUS]:         'mus',
  [ACT_NO_HAY_MUS]:  'no_hay_mus',
  [ACT_DESCARTAR]:   'descartar',
  [ACT_PASO]:        'paso',
  [ACT_ENVIDO_2]:    'envido_2',
  [ACT_ENVIDO_4]:    'envido_4',
  [ACT_ORDAGO]:      'ordago',
  [ACT_QUIERO]:      'quiero',
  [ACT_NO_QUIERO]:   'no_quiero',
  [ACT_SUBIR]:       'subir',
  [ACT_DECLARAR_SI]: 'declarar_si',
  [ACT_DECLARAR_NO]: 'declarar_no',
};

// ── UMBRALES (calibrados igual que mus_heuristic.py) ─────────────────────────

const UMBRAL_GRANDE_ENVIDO    = 0.891;
const UMBRAL_GRANDE_FUERTE    = 0.957;
const UMBRAL_CHICA_ENVIDO     = 0.891;
const UMBRAL_CHICA_FUERTE     = 0.957;
const UMBRAL_ORDAGO           = 0.997;
const UMBRAL_ORDAGO_INICIO_G  = 0.9998;
const UMBRAL_ORDAGO_INICIO_C  = 0.9978;
const INICIO_PARTIDA_UMBRAL   = 25;
const SCORE_DEFICIT_AGRESIVO  = 12;
const SCORE_DEFICIT_ORDAGO    = 20;
const RIVAL_CERCA_UMBRAL      = 35;
const AMBOS_CERCA_UMBRAL      = 35;

// ── FUNCIONES DE MANO (equivalentes a mus_engine.py) ─────────────────────────

function puntosValor(v) {
  if (v === 3 || v === 12 || v === 11 || v === 10) return 10;
  if (v === 2 || v === 1) return 1;
  return v;
}

function puntosMano(mano) {
  return mano.reduce((s, c) => s + puntosValor(c.valor), 0);
}

function tieneJuego(mano) {
  return puntosMano(mano) >= 31;
}

function es31Real(mano) {
  const sietes = mano.filter(c => c.valor === 7).length;
  const sotas  = mano.filter(c => c.valor === 10).length;
  return sietes === 3 && sotas === 1;
}

function valorJuego(mano) {
  const p = puntosMano(mano);
  if (!tieneJuego(mano)) return 0;
  if (es31Real(mano))    return 10000;
  if (p === 31) return 9999;
  if (p === 32) return 9998;
  if (p === 40) return 9997;
  if (p === 37) return 9996;
  if (p === 36) return 9995;
  if (p === 35) return 9994;
  if (p === 34) return 9993;
  if (p === 33) return 9992;
  return p;
}

function rangoGrande(v) {
  if (v === 12 || v === 3) return 8;
  if (v === 11) return 7;
  if (v === 10) return 6;
  if (v === 7)  return 5;
  if (v === 6)  return 4;
  if (v === 5)  return 3;
  if (v === 4)  return 2;
  if (v === 1 || v === 2) return 1;
  return 0;
}

function valorPares(v) {
  if (v === 3 || v === 12) return 12;
  if (v === 2 || v === 1)  return 1;
  return v;
}

function tienePareja(mano) {
  const g = {};
  for (const c of mano) {
    const k = valorPares(c.valor);
    g[k] = (g[k] || 0) + 1;
  }
  const counts = Object.values(g).sort((a, b) => b - a);
  if (counts[0] >= 4) return 'duples';
  if (counts[0] >= 3) return 'medias';
  if (counts[0] >= 2 && (counts[1] || 0) >= 2) return 'duples';
  if (counts[0] >= 2) return 'pareja';
  return null;
}

function fuerzaNumericaGrande(mano) {
  const ranks = mano.map(c => rangoGrande(c.valor)).sort((a, b) => b - a);
  const score = ranks[0]*512 + ranks[1]*64 + ranks[2]*8 + ranks[3];
  return Math.round((score - 585) / (4680 - 585) * 1000) / 1000;
}

function fuerzaNumericaChica(mano) {
  const ranks = mano.map(c => rangoGrande(c.valor)).sort((a, b) => a - b);
  const score = ranks[0]*512 + ranks[1]*64 + ranks[2]*8 + ranks[3];
  return Math.round((4680 - score) / (4680 - 585) * 1000) / 1000;
}

function handFeatures(mano) {
  return {
    fuerza_grande_num: fuerzaNumericaGrande(mano),
    fuerza_chica_num:  fuerzaNumericaChica(mano),
    tiene_juego:       tieneJuego(mano) ? 1 : 0,
    es_31_real:        es31Real(mano) ? 1 : 0,
    valor_juego:       valorJuego(mano),
    tipo_pares:        tienePareja(mano),
    puntos:            puntosMano(mano),
    valor_pares_num:   valorParejaMano(mano),  // nuevo
  };
}

function valorParejaMano(mano) {
  const g = {};
  for (const c of mano) {
    const k = valorPares(c.valor);
    g[k] = (g[k] || 0) + 1;
  }
  const entries = Object.entries(g).filter(([, v]) => v >= 2);
  if (!entries.length) return 0;
  // Para duples: suma de las dos parejas × 1000
  if (entries.length >= 2) {
    const vals = entries.map(([k]) => Number(k)).sort((a, b) => b - a);
    return 3000 + vals[0] * 10 + vals[1];
  }
  const [k, v] = entries[0];
  if (v >= 4) return 3000 + Number(k) * 10;  // cuatro iguales
  if (v >= 3) return 2000 + Number(k);        // medias
  return 1000 + Number(k);                    // pareja
}

// ── FALLBACK ──────────────────────────────────────────────────────────────────

function fallback(legal) {
  if (legal.includes(ACT_PASO)) return ACT_PASO;
  return legal[0] ?? ACT_PASO;
}

// ── MUS ───────────────────────────────────────────────────────────────────────

function decidirMus(feats, legal) {
  const fg = feats.fuerza_grande_num;
  const fc = feats.fuerza_chica_num;
  const pares = feats.tipo_pares;

  // Evaluar cuántos lances son buenos
  const buenaGrande = fg >= 0.965;
  const buenaChica  = fc >= 0.965;
  const buenosPares = pares === 'medias' || pares === 'duples' ||
    (pares === 'pareja' && feats.valor_pares_num >= 1007); // pareja de 7 o mejor
  const buenJuego   = feats.tiene_juego === 1;

  const lancesbuenos = [buenaGrande, buenaChica, buenosPares, buenJuego]
    .filter(Boolean).length;

  // Pedir mus si tiene menos de 2 lances buenos
  const quiereCambiar = lancesbuenos < 2;

  console.log(`[Heurística MUS] fg=${fg.toFixed(3)} fc=${fc.toFixed(3)} pares=${pares} juego=${feats.tiene_juego} | lances buenos=${lancesbuenos} → ${quiereCambiar ? 'MUS' : 'NO HAY MUS'}`);

  if (quiereCambiar && legal.includes(ACT_MUS)) return ACT_MUS;
  if (legal.includes(ACT_NO_HAY_MUS)) return ACT_NO_HAY_MUS;
  return fallback(legal);
}

// ── DESCARTE ──────────────────────────────────────────────────────────────────

function cartasADescartar(mano, objetivo) {
  if (objetivo === 'juego') {
    // Con juego se mantiene la mano, pero hay que descartar al menos 1
    // Descartamos la peor carta para grande (la menos útil)
    const ranks = mano.map((c, i) => ({ i, r: rangoGrande(c.valor) }));
    ranks.sort((a, b) => a.r - b.r);
    return [ranks[0].i];  // descarta solo la peor carta
  }

  if (objetivo === 'grande') {
    const ranks = mano.map((c, i) => ({ i, r: rangoGrande(c.valor) }));
    return ranks.filter(x => x.r <= 1).map(x => x.i);
  }

  if (objetivo === 'chica') {
    const ranks = mano.map((c, i) => ({ i, r: rangoGrande(c.valor) }));
    return ranks.filter(x => x.r >= 7).map(x => x.i);
  }

  if (objetivo === 'pares') {
    const grupos = {};
    mano.forEach((c, i) => {
      const k = valorPares(c.valor);
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(i);
    });
    const pairsGroups = Object.entries(grupos).filter(([, v]) => v.length >= 2);
    let keepers = new Set();
    if (pairsGroups.length >= 2) {
      pairsGroups.forEach(([, v]) => v.forEach(i => keepers.add(i)));
    } else {
      const mejor = Object.entries(grupos).sort((a, b) =>
        b[1].length - a[1].length || Number(b[0]) - Number(a[0])
      )[0];
      if (mejor) mejor[1].forEach(i => keepers.add(i));
    }
    return [0, 1, 2, 3].filter(i => !keepers.has(i));
  }
  // Garantizar mínimo 1 carta descartada
  // Si ningún caso anterior devolvió cartas, descarta la peor para grande
  const ranks = mano.map((c, i) => ({ i, r: rangoGrande(c.valor) }));
  ranks.sort((a, b) => a.r - b.r);
  return [ranks[0].i];
}

function decidirDescarte(mano, feats, cartasSeleccionadas, legal) {
  const fg = feats.fuerza_grande_num;
  const fc = feats.fuerza_chica_num;

  let objetivo;
  if (feats.tiene_juego) objetivo = 'juego';
  else if (feats.tipo_pares === 'medias' || feats.tipo_pares === 'duples') objetivo = 'pares';
  else if (fc > fg) objetivo = 'chica';
  else if (fg > fc) objetivo = 'grande';
  else if (feats.tipo_pares === 'pareja') objetivo = 'pares';
  else objetivo = 'chica';

  const indicesDescartar = cartasADescartar(mano, objetivo);

 // Garantizar mínimo 1 carta si la lista está vacía
  let indices = indicesDescartar;
  if (indices.length === 0) {
    // Descarta la carta menos útil según el objetivo
    const ranks = mano.map((c, i) => ({ i, r: rangoGrande(c.valor) }));
    if (objetivo === 'grande' || objetivo === 'juego') {
      ranks.sort((a, b) => a.r - b.r);  // peor para grande = menor rango
    } else {
      ranks.sort((a, b) => b.r - a.r);  // peor para chica = mayor rango
    }
    indices = [ranks[0].i];
  }

  const selAcciones = [ACT_SEL_CARTA_0, ACT_SEL_CARTA_1, ACT_SEL_CARTA_2, ACT_SEL_CARTA_3];
  for (const idx of indices) {
    if (!cartasSeleccionadas.includes(idx)) {
      const act = selAcciones[idx];
      if (legal.includes(act)) return act;
    }
  }

  if (legal.includes(ACT_DESCARTAR)) return ACT_DESCARTAR;
  return fallback(legal);
}

// ── APOSTAR ───────────────────────────────────────────────────────────────────

function apostarConFuerza(fuerza, agresivo, desesperado, legal,
                          umbral2, umbral4, fuerzaRaw = null, umbralOrdago = null) {
  if (fuerzaRaw === null) fuerzaRaw = fuerza;
  if (umbralOrdago === null) umbralOrdago = UMBRAL_ORDAGO;

  let fuerzaEnv = fuerza;
  if (agresivo)    fuerzaEnv = Math.min(fuerzaEnv + 0.005, 1.0);
  if (desesperado) fuerzaEnv = Math.min(fuerzaEnv + 0.010, 1.0);

  if (fuerzaRaw >= umbralOrdago && legal.includes(ACT_ORDAGO)) return ACT_ORDAGO;
  if (fuerzaEnv >= umbral4 && legal.includes(ACT_ENVIDO_4))    return ACT_ENVIDO_4;
  if (fuerzaEnv >= umbral2 && legal.includes(ACT_ENVIDO_2))    return ACT_ENVIDO_2;
  return legal.includes(ACT_PASO) ? ACT_PASO : fallback(legal);
}

function abrirApuesta(fase, feats, esMano, agresivo, desesperado, rivalCerca, legal, scoreSelf, scoreOpp) {
  if (rivalCerca && legal.includes(ACT_ORDAGO)) return ACT_ORDAGO;

  const fg = feats.fuerza_grande_num;
  const fc = feats.fuerza_chica_num;
  const bonus = esMano ? 0.05 : 0.0;

  const inicioPart = scoreSelf < INICIO_PARTIDA_UMBRAL && scoreOpp < INICIO_PARTIDA_UMBRAL;
  const umbOrdG = inicioPart ? (esMano ? UMBRAL_ORDAGO_INICIO_G : 2.0) : UMBRAL_ORDAGO;
  const umbOrdC = inicioPart ? (esMano ? UMBRAL_ORDAGO_INICIO_C : 2.0) : UMBRAL_ORDAGO;

  if (fase === 'grande') {
    return apostarConFuerza(fg + bonus, agresivo, desesperado, legal,
      UMBRAL_GRANDE_ENVIDO, UMBRAL_GRANDE_FUERTE, fg, umbOrdG);
  }

  if (fase === 'chica') {
    return apostarConFuerza(fc + bonus, agresivo, desesperado, legal,
      UMBRAL_CHICA_ENVIDO, UMBRAL_CHICA_FUERTE, fc, umbOrdC);
  }

  if (fase === 'pares') {
    const pares = feats.tipo_pares;
    if (pares === 'duples') {
      if (desesperado && legal.includes(ACT_ORDAGO)) return ACT_ORDAGO;
      return legal.includes(ACT_ENVIDO_4) ? ACT_ENVIDO_4 : ACT_ENVIDO_2;
    }
    if (pares === 'medias') {
      return (agresivo && legal.includes(ACT_ENVIDO_4)) ? ACT_ENVIDO_4
           : legal.includes(ACT_ENVIDO_2) ? ACT_ENVIDO_2
           : ACT_PASO;
    }
    if (pares === 'pareja') {
      if ((agresivo || esMano) && legal.includes(ACT_ENVIDO_2)) return ACT_ENVIDO_2;
      return legal.includes(ACT_PASO) ? ACT_PASO : fallback(legal);
    }
    return legal.includes(ACT_PASO) ? ACT_PASO : fallback(legal);
  }

  if (fase === 'juego') {
    if (feats.es_31_real) {
      return legal.includes(ACT_ORDAGO) ? ACT_ORDAGO : ACT_ENVIDO_4;
    }
    const vj = feats.valor_juego;
    let calidad;
    if (vj >= 9998)      calidad = 'excelente';
    else if (vj >= 9996) calidad = 'buena';
    else if (vj >= 9994) calidad = 'media';
    else                  calidad = 'mala';

    if (calidad === 'excelente') {
      return legal.includes(ACT_ORDAGO) ? ACT_ORDAGO : ACT_ENVIDO_4;
    }
    if (calidad === 'buena') {
      if (desesperado && legal.includes(ACT_ORDAGO)) return ACT_ORDAGO;
      return legal.includes(ACT_ENVIDO_4) ? ACT_ENVIDO_4 : ACT_ENVIDO_2;
    }
    if (calidad === 'media') {
      if (agresivo) return legal.includes(ACT_ENVIDO_4) ? ACT_ENVIDO_4 : ACT_ENVIDO_2;
      return legal.includes(ACT_ENVIDO_2) ? ACT_ENVIDO_2 : ACT_PASO;
    }
    return legal.includes(ACT_PASO) ? ACT_PASO : fallback(legal);
  }

  if (fase === 'punto') {
    const ptsNorm = feats.puntos / 30.0;
    return apostarConFuerza(ptsNorm + bonus, agresivo, desesperado, legal, 0.70, 0.88);
  }

  return fallback(legal);
}

// ── RESPONDER ─────────────────────────────────────────────────────────────────

function responderConFuerza(fuerza, cantidad, esOrdago, agresivo, desesperado,
                             umbralQuiero, umbralSubir, legal, fuerzaRaw = null) {
  if (fuerzaRaw === null) fuerzaRaw = fuerza;
  if (agresivo)    fuerza = Math.min(fuerza + 0.003, 1.0);
  if (desesperado) fuerza = Math.min(fuerza + 0.008, 1.0);

  if (esOrdago) {
    if (fuerzaRaw >= 0.997 || desesperado) {
      return legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal);
    }
    return legal.includes(ACT_NO_QUIERO) ? ACT_NO_QUIERO : fallback(legal);
  }

  if (fuerza >= umbralSubir && !esOrdago) {
    if (legal.includes(ACT_SUBIR)) return ACT_SUBIR;
    if (legal.includes(ACT_ORDAGO) && fuerzaRaw >= 0.997) return ACT_ORDAGO;
  }

  if (fuerza >= umbralQuiero) {
    return legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal);
  }

  return legal.includes(ACT_NO_QUIERO) ? ACT_NO_QUIERO : fallback(legal);
}

function responderApuesta(fase, feats, apuesta, esMano, agresivo, desesperado,
                           rivalCerca, declOpp, legal) {
  if (rivalCerca) {
    if (legal.includes(ACT_ORDAGO)) return ACT_ORDAGO;
    if (legal.includes(ACT_QUIERO)) return ACT_QUIERO;
  }

  const cantidad = apuesta.cantidad;
  const esOrdago = cantidad === 999;
  const fg = feats.fuerza_grande_num;
  const fc = feats.fuerza_chica_num;
  const bonus = esMano ? 0.05 : 0.0;

  if (fase === 'grande') {
    const subirOk = cantidad <= 4;
    return responderConFuerza(fg + bonus, cantidad, esOrdago, agresivo, desesperado,
      0.954, subirOk ? 0.993 : 1.1, legal, fg);
  }

  if (fase === 'chica') {
    const subirOk = cantidad <= 4;
    return responderConFuerza(fc + bonus, cantidad, esOrdago, agresivo, desesperado,
      0.954, subirOk ? 0.993 : 1.1, legal, fc);
  }

  if (fase === 'pares') {
    const pares = feats.tipo_pares;
    if (pares === 'duples') {
      if (!esOrdago && legal.includes(ACT_SUBIR) && cantidad <= 2) return ACT_SUBIR;
      return legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal);
    }
    if (pares === 'medias') {
      if (esOrdago) return desesperado ? ACT_QUIERO : ACT_NO_QUIERO;
      return legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal);
    }
    if (pares === 'pareja') {
      if (esOrdago) return legal.includes(ACT_NO_QUIERO) ? ACT_NO_QUIERO : fallback(legal);
      return (cantidad <= 2 || agresivo)
        ? (legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal))
        : ACT_NO_QUIERO;
    }
    return legal.includes(ACT_NO_QUIERO) ? ACT_NO_QUIERO : fallback(legal);
  }

  if (fase === 'juego') {
    if (feats.es_31_real) {
      return legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal);
    }
    const puntos = feats.puntos;
    const ptsNorm = puntos / 40.0;
    if (esOrdago) {
      if (puntos <= 31 || desesperado) {
        return legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal);
      }
      return legal.includes(ACT_NO_QUIERO) ? ACT_NO_QUIERO : fallback(legal);
    }
    if (feats.tiene_juego) {
      if (puntos <= 31 && legal.includes(ACT_ORDAGO) && desesperado) return ACT_ORDAGO;
      if (ptsNorm + bonus >= 0.80) {
        return legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal);
      }
      return legal.includes(ACT_NO_QUIERO) ? ACT_NO_QUIERO : fallback(legal);
    }
    return legal.includes(ACT_NO_QUIERO) ? ACT_NO_QUIERO : fallback(legal);
  }

  if (fase === 'punto') {
    const ptsNorm = feats.puntos / 30.0 + bonus;
    if (esOrdago) {
      if (ptsNorm >= 0.87 || desesperado) {
        return legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal);
      }
      return legal.includes(ACT_NO_QUIERO) ? ACT_NO_QUIERO : fallback(legal);
    }
    if (ptsNorm >= 0.70) {
      return legal.includes(ACT_QUIERO) ? ACT_QUIERO : fallback(legal);
    }
    return legal.includes(ACT_NO_QUIERO) ? ACT_NO_QUIERO : fallback(legal);
  }

  return fallback(legal);
}

// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────────

/**
 * Decide la acción del bot dada la situación del juego.
 *
 * @param {object} gameState
 * @param {number[]} legalActions — lista de acciones legales (enteros)
 * @returns {number} acción elegida
 */
export function heuristicDecide(gameState, legalActions) {
  const mano              = gameState.mano || [];
  const fase              = gameState.fase || 'mus';
  const faseApuesta       = gameState.faseApuesta || 'grande';
  const esMano            = gameState.esMano || false;
  const scoreSelf         = gameState.scoreSelf || 0;
  const scoreOpp          = gameState.scoreOpp || 0;
  const apuesta           = gameState.apuestaAbierta || null;
  const cartasSel         = gameState.cartasSeleccionadas || [];

  if (!mano.length) return fallback(legalActions);

  const scoreDiff  = scoreSelf - scoreOpp;
  const agresivo   = scoreDiff < -SCORE_DEFICIT_AGRESIVO;
  const desesperado = scoreDiff < -SCORE_DEFICIT_ORDAGO;
  const rivalCerca = scoreOpp >= RIVAL_CERCA_UMBRAL && scoreSelf < AMBOS_CERCA_UMBRAL;

  const feats = handFeatures(mano);

  if (fase === 'mus') {
    return decidirMus(feats, legalActions);
  }

  if (fase === 'descarte') {
    return decidirDescarte(mano, feats, cartasSel, legalActions);
  }

  if (fase === 'declarar_pares' || fase === 'declarar_juego') {
    if (legalActions.includes(ACT_DECLARAR_SI)) return ACT_DECLARAR_SI;
    if (legalActions.includes(ACT_DECLARAR_NO)) return ACT_DECLARAR_NO;
    return fallback(legalActions);
  }

  if (['grande', 'chica', 'pares', 'juego', 'punto'].includes(fase)) {
    if (!apuesta) {
      return abrirApuesta(faseApuesta, feats, esMano, agresivo, desesperado,
        rivalCerca, legalActions, scoreSelf, scoreOpp);
    } else {
      return responderApuesta(faseApuesta, feats, apuesta, esMano, agresivo,
        desesperado, rivalCerca, null, legalActions);
    }
  }

  return fallback(legalActions);
}

/**
 * Construye el array de acciones legales para las fases de apuesta,
 * equivalente a getLegalActions en musBot.js.
 */
export function getLegalActionsHeuristic(faseApuesta, apuestaAbierta) {
  if (!apuestaAbierta) {
    return [ACT_PASO, ACT_ENVIDO_2, ACT_ENVIDO_4, ACT_ORDAGO];
  }
  const c = apuestaAbierta.cantidad;
  if (c === 999) return [ACT_QUIERO, ACT_NO_QUIERO];
  return [ACT_QUIERO, ACT_NO_QUIERO, ACT_SUBIR, ACT_ENVIDO_4, ACT_ORDAGO];
}
