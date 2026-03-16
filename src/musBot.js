/**
 * musBot.js
 * =========
 * Bot DQN para el juego de mus.
 * Carga el modelo ONNX y construye el vector de observación
 * replicando la lógica de mus_env.py _build_obs_for().
 *
 * Uso en Mus.jsx:
 *   import { initDQN, dqnDecide } from './musBot.js';
 *   await initDQN();  // llamar una vez al inicio
 *   const accion = await dqnDecide(gameState);
 */

import * as ort from 'onnxruntime-web';

// ── CONSTANTES (deben coincidir con mus_env.py) ───────────────────────────────

const PALOS  = ['oros', 'copas', 'espadas', 'bastos'];
const VALORES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const FASES  = ['inicio', 'mus', 'descarte', 'grande', 'chica',
                'declarar_pares', 'pares', 'declarar_juego', 'juego', 'punto', 'fin'];
const FASES_APUESTA = ['grande', 'chica', 'pares', 'juego', 'punto'];
const PUNTOS_VICTORIA = 40;
const OBS_SIZE = 23;

// Índices de acción (deben coincidir con mus_env.py)
const ACT_PASO      = 3;
const ACT_ENVIDO_2  = 4;
const ACT_ENVIDO_4  = 5;
const ACT_ORDAGO    = 6;
const ACT_QUIERO    = 7;
const ACT_NO_QUIERO = 8;

const ACCIONES_MODELO = [ACT_PASO, ACT_ENVIDO_2, ACT_ENVIDO_4,
                          ACT_ORDAGO, ACT_QUIERO, ACT_NO_QUIERO];

const ACTION_NAMES = {
  [ACT_PASO]:      'paso',
  [ACT_ENVIDO_2]:  'envido_2',
  [ACT_ENVIDO_4]:  'envido_4',
  [ACT_ORDAGO]:    'ordago',
  [ACT_QUIERO]:    'quiero',
  [ACT_NO_QUIERO]: 'no_quiero',
};

// ── FUNCIONES DE APOYO ────────────────────────────────────────────────────────

function paloIdx(palo)  { return PALOS.indexOf(palo); }
function valorIdx(v)    { return VALORES.indexOf(v); }
function faseIdx(fase)  { return Math.max(0, FASES.indexOf(fase)); }
function faseApuestaIdx(fa) {
  const idx = FASES_APUESTA.indexOf(fa);
  return idx >= 0 ? idx : 0;
}

function puntosValor(v) {
  if (v === 3 || v === 12 || v === 11 || v === 10) return 10;
  if (v === 2 || v === 1) return 1;
  return v;
}
function puntosMano(mano) {
  return mano.reduce((s, c) => s + puntosValor(c.valor), 0);
}
function tieneJuego(mano) { return puntosMano(mano) >= 31; }

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

function fuerzaNumericaGrande(mano) {
  // Replica fuerza_numerica_grande de mus_engine.py
  const ranks = mano.map(c => rangoGrande(c.valor)).sort((a, b) => b - a);
  const score = ranks[0] * 512 + ranks[1] * 64 + ranks[2] * 8 + ranks[3];
  return Math.round((score - 585) / (4680 - 585) * 100) / 100;
}

function fuerzaNumericaChica(mano) {
  // Replica fuerza_numerica_chica — mismo cálculo pero invierte
  const ranks = mano.map(c => rangoGrande(c.valor)).sort((a, b) => a - b);
  const score = ranks[0] * 512 + ranks[1] * 64 + ranks[2] * 8 + ranks[3];
  return Math.round((4680 - score) / (4680 - 585) * 100) / 100;
}

function tienePareja(mano) {
  const g = {};
  for (const c of mano) {
    const k = (c.valor === 3 || c.valor === 12) ? 12
            : (c.valor === 2 || c.valor === 1)  ? 1
            : c.valor;
    g[k] = (g[k] || 0) + 1;
  }
  const counts = Object.values(g).sort((a, b) => b - a);
  if (counts[0] >= 4) return 'duples';
  if (counts[0] >= 3) return 'medias';
  if (counts[0] >= 2 && (counts[1] || 0) >= 2) return 'duples';
  if (counts[0] >= 2) return 'pareja';
  return null;
}

/**
 * Construye el vector de observación de 23 dimensiones
 * replicando mus_env.py _build_obs_for(player=0)
 *
 * gameState debe tener:
 *   manoJugador   — array de {palo, valor}  (perspectiva jugador = player 0)
 *   fase          — string ('grande', 'chica', etc.)
 *   faseApuesta   — string
 *   esManoJugador — bool
 *   puntosJugador — int (score acumulado)
 *   puntosBot     — int (score acumulado)
 *   apuestaAbierta — null | {cantidad, quien}  ('jugador' | 'bot')
 *   declaracionBot — null | 'si' | 'no'
 */
function buildObs(gameState) {
  const {
    manoJugador, fase, faseApuesta,
    esManoJugador, puntosJugador, puntosBot,
    apuestaAbierta, declaracionBot,
  } = gameState;

  const obs = new Float32Array(OBS_SIZE);
  const mano = manoJugador || [];

  // [0:8] codificación de cartas (valor_idx/9, palo_idx/3) por carta
  for (let i = 0; i < Math.min(mano.length, 4); i++) {
    obs[i * 2]     = valorIdx(mano[i].valor) / 9.0;
    obs[i * 2 + 1] = paloIdx(mano[i].palo)  / 3.0;
  }

  // [8-12] features de mano
  if (mano.length > 0) {
    obs[8]  = fuerzaNumericaGrande(mano);
    obs[9]  = fuerzaNumericaChica(mano);
    obs[10] = tieneJuego(mano) ? 1.0 : 0.0;
    obs[11] = puntosMano(mano) / 40.0;
    const paresMap = { null: 0, pareja: 1, medias: 2, duples: 3 };
    obs[12] = (paresMap[tienePareja(mano)] || 0) / 3.0;
  }

  // [13] es mano
  obs[13] = esManoJugador ? 1.0 : 0.0;

  // [14-15] marcador
  obs[14] = puntosJugador / PUNTOS_VICTORIA;
  obs[15] = puntosBot      / PUNTOS_VICTORIA;

  // [16] fase actual
  obs[16] = faseIdx(fase) / Math.max(FASES.length - 1, 1);

  // [17-18] apuesta abierta
  if (apuestaAbierta) {
    obs[17] = Math.min(apuestaAbierta.cantidad, 999) / 999.0;
    // 1.0 si la apostó el jugador (player 0), 1.0 si la apostó el bot
    obs[18] = apuestaAbierta.quien === 'jugador' ? 1.0 : 2.0 / 2.0;
  }

  // [19-20] declaración del oponente (bot = player 1)
  obs[19] = declaracionBot === 'si' ? 1.0 : declaracionBot === null ? 0.5 : 0.0;
  obs[20] = declaracionBot === 'si' ? 1.0 : declaracionBot === null ? 0.5 : 0.0;

  // [21] cartas seleccionadas (bitmask) — siempre 0 en fase de apuesta
  obs[21] = 0.0;

  // [22] fase de apuesta actual
  obs[22] = faseApuestaIdx(faseApuesta) / 4.0;

  return obs;
}

// ── SESIÓN ONNX ───────────────────────────────────────────────────────────────

let session = null;

export async function initDQN(modelUrl = '/mus_dqn.onnx') {
  const info = await fetch('/mus_model_info.json').then(r => r.json());
  console.log('DQN cargado:', info.model, '| win rate:', info.win_rate_heuristica);
  if (session) return;
  try {
    session = await ort.InferenceSession.create(modelUrl);
    console.log('DQN cargado:', modelUrl);
  } catch (e) {
    console.error('Error cargando DQN:', e);
    session = null;
  }
}

/**
 * Decide la acción del bot usando el modelo DQN.
 *
 * @param {object} gameState  — estado del juego (ver buildObs)
 * @param {number[]} legalActions — array de índices de acciones legales
 * @returns {string} nombre de la acción ('paso', 'envido_2', etc.)
 *                   o null si el modelo no está disponible
 */
export async function dqnDecide(gameState, legalActions) {
  if (!session) {
    console.warn('DQN no inicializado');
    return null;
  }

  const obs = buildObs(gameState);
  const tensor = new ort.Tensor('float32', obs, [1, OBS_SIZE]);

  const results = await session.run({ obs: tensor });
  const qValues = results['q_values'].data;  // Float32Array de N_ACTIONS

  // Seleccionar la acción legal del modelo con mayor Q-value
  let bestAction = null;
  let bestQ = -Infinity;
  for (const a of legalActions) {
    if (ACCIONES_MODELO.includes(a) && qValues[a] > bestQ) {
      bestQ = qValues[a];
      bestAction = a;
    }
  }

  if (bestAction === null) return null;
  return ACTION_NAMES[bestAction] || null;
}

/**
 * Convierte acciones de Mus.jsx al formato de índice numérico.
 * Útil para construir legalActions desde el estado del componente.
 */
export function getLegalActions(fase, apuestaAbierta) {
  const legal = [];
  if (!apuestaAbierta) {
    legal.push(ACT_PASO, ACT_ENVIDO_2, ACT_ENVIDO_4, ACT_ORDAGO);
  } else {
    const c = apuestaAbierta.cantidad;
    if (c === 999) {
      legal.push(ACT_QUIERO, ACT_NO_QUIERO);
    } else {
      legal.push(ACT_QUIERO, ACT_NO_QUIERO, ACT_ENVIDO_2, ACT_ENVIDO_4, ACT_ORDAGO);
    }
  }
  return legal;
}
