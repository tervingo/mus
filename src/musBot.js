import { heuristicDecide, getLegalActionsHeuristic,
         ACT_PASO, ACT_ENVIDO_2, ACT_ENVIDO_4, ACT_ORDAGO,
         ACT_QUIERO, ACT_NO_QUIERO, ACT_SUBIR,
} from './musHeuristic.js';

// ── IA CON CLAUDE API ─────────────────────────────────────────────────────────
export async function consultarIA(prompt) {
  try {
    const apiUrl = import.meta.env.DEV
      ? "http://localhost:3001/api/claude"
      : "/.netlify/functions/claude"
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `Eres un jugador experto de mus español. Respondes ÚNICAMENTE con JSON válido sin texto adicional ni markdown.

EQUIVALENCIAS: los 3 valen como Reyes (en todas las situaciones), los 2 valen como Ases (en todas las situaciones).

LANCES Y CÓMO SE GANAN:
- Grande: gana quien tenga cartas MÁS ALTAS comparando carta a carta (de mayor a menor) según la escala R/3 > C > S > 7 > 6 > 5 > 4 > A/2. NO se suman puntos: se compara la 1ª carta con la 1ª carta, si hay empate la 2ª con la 2ª, etc. En empate absoluto gana el mano.
- Chica: igual pero gana quien tenga cartas MÁS BAJAS. Escala A/2 < 4 < 5 < 6 < 7 < S < C < R/3. NO se suman puntos: se compara la carta más baja del jugador con la más baja del rival, etc. En empate gana el mano.
- Pares: se requiere al menos una pareja. Duples (dos parejas) > Medias (trío) > Pareja. En empate gana quien tenga el grupo de mayor valor de carta. Las declaraciones son obligatoriamente honestas.
- Juego: necesitas suma de puntos ≥ 31 (Rey/Caballo/Sota/3=10pts, As/2=1pt, resto=su valor). Gana: 31 real (tres 7s+Sota) > 31 normal > 32 > 33 > ... Las declaraciones son obligatoriamente honestas.
- Punto: solo si ninguno tiene juego. Gana quien tenga más puntos (máx. 30).

ESTRATEGIA:
- En grande y chica, recibirás tu mano ordenada y una valoración de fuerza (muy fuerte/fuerte/media/débil/muy débil). Basa tus decisiones de apuesta en esa fuerza, no en suposiciones sobre puntos.
- Farolea cuando vayas perdiendo en el marcador o cuando tu mano sea débil pero tengas algo que ganar.
- Si vas ganando cómodamente, juega más conservador para no arriesgar.
- El mano habla primero en cada lance y gana los empates: ten esto en cuenta al decidir si envidar o pasar.`,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("Error IA:", e);
    return null;
  }
}

// ── IA CON HEURÍSTICA ─────────────────────────────────────────────────────────
export const ACTION_INT_TO_STR = {
  [ACT_PASO]:      'paso',
  [ACT_ENVIDO_2]:  'envido_2',
  [ACT_ENVIDO_4]:  'envido_4',
  [ACT_ORDAGO]:    'ordago',
  [ACT_QUIERO]:    'quiero',
  [ACT_NO_QUIERO]: 'no_quiero',
  [ACT_SUBIR]:     'envido_2',  // subir = envido_2 adicional
};

export function consultarHeuristica(gameState) {
  try {
    const legal = getLegalActionsHeuristic(gameState.faseApuesta, gameState.apuestaAbierta);
    const accionInt = heuristicDecide({
      mano:              gameState.manoJugador,
      fase:              gameState.faseApuesta,
      faseApuesta:       gameState.faseApuesta,
      esMano:            gameState.esManoJugador,
      scoreSelf:         gameState.puntosJugador,
      scoreOpp:          gameState.puntosBot,
      apuestaAbierta:    gameState.apuestaAbierta,
      cartasSeleccionadas: [],
    }, legal);
    const accion = ACTION_INT_TO_STR[accionInt] || 'paso';
    return { accion };
  } catch (e) {
    console.error('Error heurística:', e);
    return null;
  }
}
