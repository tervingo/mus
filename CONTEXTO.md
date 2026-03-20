# CONTEXTO — Proyecto Mus

Fichero de referencia para Claude Code. Resume las decisiones de diseño, reglas implementadas
y estado actual del proyecto.

---

## Stack

- **Frontend:** React 18 + Vite (`C:\Users\j4alo\Dropbox\Eltomalturta\mus`)
- **Despliegue:** Netlify (frontend estático, sin backend)
- **Bot heurístico:** `musHeuristic.js` — política calibrada, sin API, instantáneo
- **Bot Claude:** `consultarIA` vía API de Anthropic (con proxy Express en local, Netlify function en producción)
- **API key:** variable de entorno `VITE_ANTHROPIC_API_KEY` (`.env` local, Netlify env vars en prod)

## Estructura de ficheros relevantes

```
src/
  Mus.jsx           — Componente principal (~1600 líneas). UI + lógica de juego React.
  musHeuristic.js   — Política heurística del bot + constantes de acciones + funciones de mano
main.jsx            — Entry point React
```

---

## Reglas del juego implementadas

### Baraja
- Española de 40 cartas (sin 8 ni 9): As(1), 2, 3, 4, 5, 6, 7, Sota(10), Caballo(11), Rey(12)
- **Equivalencias críticas:** 3 = Rey en TODAS las situaciones; 2 = As en TODAS las situaciones
- Sota/Caballo/Rey/3 valen **10 puntos**; As/2 valen **1 punto**; resto = valor nominal

### Reparto y descarte
- Se reparten 4 cartas a cada jugador de un mazo barajado de 40
- En el descarte se usa un **único mazo** que excluye las cartas en juego (mano jugador + mano bot)
- El jugador descarta primero, el bot descarta del mismo mazo a continuación
- **Todos** los jugadores deben descartar al menos 1 carta cuando hay mus
- Solo cuando el mazo se agota (muchos muses) se reciclan los descartes

### Flujo de una mano
1. **Mus** — cada jugador decide si pide mus o dice "no hay mus"
   - El mano habla primero
   - Si ambos quieren mus → descarte → nueva ronda de mus (hasta max 3 veces)
   - Si alguien dice "no hay mus" → fin del mus, empieza la apuesta
2. **Grande** — gana quien tenga cartas más altas (R/3 > C > S > 7 > 6 > 5 > 4 > A/2), comparando carta a carta
3. **Chica** — igual pero gana quien tenga cartas más bajas
4. **Pares** — declaración obligatoria + apuesta si ambos tienen. Duples > Medias > Pareja
5. **Juego** — declaración obligatoria + apuesta si ambos suman ≥31. 31 real > 31 > 32 > 40 > 37 > 36 > 35 > 34 > 33
6. **Punto** — solo si ninguno tiene juego. Gana quien más se acerque a 30 (máx 30)

### Quién habla primero
- **El mano habla primero** en cada lance y en el mus
- En empate, **gana el mano**
- El mano cambia cada mano (se alterna)

### Sistema de apuestas
- **paso** — no apuesta
- **envido_2** — apuesta 2 piedras (o sube 2 si ya hay apuesta)
- **envido_4** — apuesta 4 piedras (o sube 4 si ya hay apuesta)
- **ordago** — lo apuesta todo (6 piedras si se quiere)
- **quiero** — acepta la apuesta
- **no_quiero** — rechaza

#### Regla crítica de "porque no"
- La **piedra de "porque no"** solo se cobra si no hay apuestas aceptadas previas
- Si A envida → B sube (= acepta la de A y añade más) → A no quiere:
  - B cobra las piedras que A había aceptado (no 1 piedra de "porque no")
- Implementado en `apuestaAbierta.cantidadAceptada`:
  - `0` en apertura
  - `cantidad_previa` cuando alguien sube

#### Cuándo se cobran los puntos
- **Grande y chica** (envite querido): se guarda en `grandeResultadoRef`/`chicaResultadoRef` y se cobra AL FINAL junto con pares/juego
- **"Porque no"**: se cobra INMEDIATAMENTE al producirse
- **Pares/juego/punto** (envite querido): se guarda el extra y se cobra al final con los puntos base
- Si un jugador llega a 40 con un "porque no", la **partida termina inmediatamente** (función `comprobarVictoriaInmediata`)

### Declaraciones
- Pares y juego: declaración **obligatoriamente honesta**
- El entorno solo ofrece la acción correcta (no se puede mentir)

### Victoria
- Primera a **40 piedras** gana
- Si un jugador llega a 40 durante una mano (por "porque no"), la partida termina inmediatamente sin jugar los lances restantes

---

## Estado de `apuestaAbierta`

```js
{
  cantidad: number,          // total en juego
  cantidadAceptada: number,  // piedras ya comprometidas (0 si no hay)
  quien: 'jugador' | 'bot'   // quién hizo el último envite
}
```

---

## Bots disponibles

### Bot Heurística (`musHeuristic.js`)
- Política calibrada contra percentiles reales de manos
- Sin API, sin modelo, instantáneo
- Función principal: `heuristicDecide(gameState, legalActions) → int`
- `gameState`: `{ mano, fase, faseApuesta, esMano, scoreSelf, scoreOpp, apuestaAbierta, cartasSeleccionadas }`
- Seleccionable en la pantalla de inicio con "⚡ Bot Heurística"

### Bot Claude (API)
- Llama a `claude-sonnet-4-20250514` vía API de Anthropic
- Genera razonamientos en lenguaje natural
- En local: proxy Express en `proxy.js` (puerto 3001)
- En Netlify: `/.netlify/functions/claude`
- Seleccionable en pantalla de inicio con "🤖 Bot Claude"

---

## Umbrales heurísticos calibrados (`musHeuristic.js`)

```
UMBRAL_GRANDE_ENVIDO  = 0.891  // top 60% abre con envido_2
UMBRAL_GRANDE_FUERTE  = 0.957  // top 40% sube a envido_4
UMBRAL_CHICA_ENVIDO   = 0.891
UMBRAL_CHICA_FUERTE   = 0.957
UMBRAL_ORDAGO         = 0.997  // top ~3.7%
UMBRAL_ORDAGO_INICIO_G = 0.9998 // inicio de partida (ambos < 25 pts)
UMBRAL_ORDAGO_INICIO_C = 0.9978
SCORE_DEFICIT_AGRESIVO = 12    // si va perdiendo por 12+, más agresivo
SCORE_DEFICIT_ORDAGO   = 20    // si va perdiendo por 20+, órdago con mano media
RIVAL_CERCA_UMBRAL     = 35    // rival >= 35 y yo < 35 → muerte dulce → órdago siempre
```

### Lógica de mus (cuándo pedir mus)
- Pide mus si tiene **menos de 2 lances buenos**
- Lance bueno: grande/chica con fuerza >= 0.965, pares de 7 o mejor/medias/duples, o juego

---

## Estado React relevante en `Mus.jsx`

| Estado | Tipo | Descripción |
|--------|------|-------------|
| `fase` | string | Fase actual: `'inicio'`, `'mus'`, `'descarte'`, `'apuesta'`, `'declarar_pares'`, `'declarar_juego'`, `'puntos'`, `'fin'` |
| `faseApuesta` | string | Lance actual: `'grande'`, `'chica'`, `'pares'`, `'juego'`, `'punto'` |
| `manoJugador` | array | Cartas del jugador: `[{palo, valor}]` |
| `manoBot` | array | Cartas del bot |
| `esManoJugador` | bool | Si el jugador es mano (habla primero, gana empates) |
| `puntosJugador` | int | Piedras acumuladas (marcador) |
| `puntosBot` | int | |
| `boteJugador` | int | Piedras ganadas en la mano actual (pendientes de sumar) |
| `boteBot` | int | |
| `apuestaAbierta` | object\|null | `{cantidad, cantidadAceptada, quien}` |
| `modoDQN` | bool | `true` = Bot Heurística; `false` = Bot Claude |
| `botPaso` | bool | El bot (siendo mano) ya pasó en este lance |
| `botPidioMus` | bool | El bot (siendo mano) ya pidió mus |
| `estadoLances` | object | Estado visual de cada lance: `{grande, chica, pares, juego, punto}` |

### Refs importantes
- `manoJRef`, `manoBRef` — manos actualizadas sin stale closures
- `ptJRef`, `ptBRef` — puntos del marcador
- `boteJRef`, `boteBRef` — botes de la mano
- `esManoJRef` — quién es mano
- `faseApuestaRef` — fase de apuesta actual
- `grandeResultadoRef`, `chicaResultadoRef` — resultado de grande/chica (se cobra al final)
- `modoDQNRef` — ref de modoDQN para evitar stale closures en callbacks

---

## Flujo del bot cuando es mano

El bot habla primero en cada fase cuando es mano:

- **Mus:** `botDecideMus()` llamado por `useEffect` cuando `fase === 'mus' && !esManoJugador`
- **Apuesta:** `botAbreApuesta()` llamado por `useEffect` cuando `fase === 'apuesta' && !apuestaAbierta && !esManoJugador`
- Los `useEffect` usan `botMusDecididoRef` y `botPaso` para evitar bucles

---

## Panel de estado de lances

Panel visual a la izquierda del tablero que muestra el estado de cada lance:
- `null` — pendiente
- `{tipo: 'paso'}` — ambos pasaron
- `{tipo: 'envidada', pts, quien}` — envite querido (se cobra al final)
- `{tipo: 'no_querida', pts, quien}` — cobrada en el momento

---

## Trabajo pendiente / mejoras sugeridas

### Refactorización urgente
- **Dividir `Mus.jsx`** (~1600 líneas) en módulos más pequeños:
  - `musGameLogic.js` — `resolverApuesta`, `resolverPunto`, `cobrarNoQuiero`, `comprobarVictoriaInmediata`
  - `musBot.js` — `botAbreApuesta`, `botDecideMus`, `botDecide`, `consultarHeuristica`, `consultarIA`
  - `Mus.jsx` — solo UI y estado React
- **`musHeuristic.js`** ya está bien separado pero podría dividirse:
  - Las funciones de cálculo de mano (puntos, rangos, fuerza) podrían ir a `musEngine.js`

### Mecánica pendiente de verificar
- Reciclaje del mazo cuando se agota (muchos muses consecutivos)
- Verificar que el "Subir" del jugador en la UI funciona correctamente con `cantidadAceptada`

### Mejoras de UX
- Botón para ver/ocultar cartas del bot durante la partida (no solo al final)
- Historial de manos jugadas
- Animaciones de cartas

### Posibles mejoras de IA
- El bot heurístico es muy bueno pero no farolea — podría añadirse un parámetro de "osadía"
- Self-play con RL (GRPO/PPO) para superar la heurística — requiere GPU y diseño cuidadoso de recompensa
