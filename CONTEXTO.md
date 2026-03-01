# CONTEXTO — Proyecto Mus

Este fichero resume las reglas implementadas y las decisiones de diseño tomadas durante
el desarrollo de `Mus.jsx`, para que sirva de referencia al continuar el desarrollo.

---

## Stack

- **Frontend:** React 18 + Vite (sin CSS externo, todo inline styles)
- **Backend:** proxy Express (`proxy.js`) que reenvía llamadas a la API de Anthropic
- **IA del bot:** Claude Sonnet (claude-sonnet-4-20250514) vía API, consulta en cada decisión

---

## Reglas del juego implementadas

### Baraja
- Baraja española de 40 cartas (sin 8 ni 9)
- Valores: As(1), 2, 3, 4, 5, 6, 7, Sota(10), Caballo(11), Rey(12)
- **Equivalencias clave:**
  - 3 = Rey a todos los efectos (puntos y pares)
  - 2 = As a todos los efectos (puntos y pares)
  - Sota, Caballo, Rey y 3 valen **10 puntos** cada uno
  - As y 2 valen **1 punto** cada uno

### Flujo de una mano
1. **Mus** — cada jugador decide si pide mus (cambiar cartas) o dice "no hay mus"
2. **Descarte** — si hay mus, cada jugador descarta las cartas que quiera
3. **Grande** — apuestas (puede quedar en paso)
4. **Chica** — apuestas (puede quedar en paso)
5. **Pares** — declaración obligatoria + apuestas si ambos tienen
6. **Juego** — declaración obligatoria + apuestas si ambos tienen
7. **Conteo final** — se resuelven todos los puntos de la mano

### Lance de GRANDE
- Gana quien tenga la(s) carta(s) más alta(s)
- Orden: **R/3 > C > S > 7 > 6 > 5 > 4 > A/2**
- Comparación carta a carta (las 4 cartas ordenadas de mayor a menor)
- En empate gana el **mano** (el jugador humano en nuestra implementación)
- Si quedó en **paso** (nadie apostó): el ganador recibe **1 piedra** al final

### Lance de CHICA
- Gana quien tenga la(s) carta(s) más baja(s)
- Orden: **A/2 < 4 < 5 < 6 < 7 < S < C < R/3**
- Comparación carta a carta (las 4 cartas ordenadas de menor a mayor)
- En empate gana el **mano**
- Si quedó en **paso**: el ganador recibe **1 piedra** al final

### Lance de PARES
- **Declaración obligatoria y honesta** — si tienes pares DEBES declararlo, no se puede mentir
- Si solo uno declara pares: no hay apuesta, los puntos se cuentan al final
- Si ambos declaran: hay apuesta normal
- **Jerarquía:** Duples > Medias > Pareja o par
- **Puntos base** (se cuentan siempre al final para quien gana el lance):
  - Pareja/Par (2 cartas iguales) = **1 punto**
  - Medias (3 cartas iguales) = **2 puntos**
  - Duples (2 parejas, iguales o distintas, incluye 4 iguales) = **3 puntos**
- En empate de tipo de pares, gana quien tenga el par de mayor valor
- Lo apostado se **suma** a los puntos base del ganador del lance

### Lance de JUEGO
- **Declaración obligatoria y honesta** — si tienes 31+ puntos DEBES declararlo
- Necesitas **31 o más puntos** para tener juego
- Si solo uno declara juego: no hay apuesta, puntos al final
- Si ambos declaran: apuesta normal
- **Jerarquía y puntos base:**
  - 31 real (7+7+7+Sota) = gana a cualquier otro 31, incluso al mano = **3 puntos**
  - 31 normal = **3 puntos**
  - El resto de puntuaciones que se consideran juego son:  31 > 32 > 40 > 37 > 36 > 35 > 34 > 33
  - 32, 40, 37, 36, 35, 34, 33 = **2 puntos**
- Si ninguno tiene juego: **1 punto** al ganador de grande (el de más puntos sumados)
- Lo apostado se **suma** a los puntos base del ganador del lance

### Lance de PUNTO

- Si ningún jugador tiene juego se pasa al lance de punto.
- La jerarquía de punto es 30 > 29 > 28 >....
- El sistema de apuesta es como en el resto de lances
- El jugador que gana el punto se apunta 1 punto además de las posibles apuestas
- **Implementado:** cuando ambos declaran no tener juego, se abre ronda de apuestas (faseApuesta="punto").
  La apuesta ganada se guarda en `apuestaExtraPunto` y se resuelve en `resolverPunto` junto al 1 de base.

### Sistema de apuestas
- **Envido:** apuesta piedras (2 o 4 en la implementación actual)
- **Órdago:** apuesta todo (valor 999 internamente, equivale a 6 piedras si se acepta)
- **No quiero:** quien no quiere paga **1 piedra** ("porque no") al que envidó. Si hay apuestas aceptadas el jugador "no querido" se saca el monto de las apuestas aceptadas: 
  por ejemplo (jugadores A y B):  A: envido, B: envido 2 más, A: envido 2 más, B: no quiero ==> A se saca 4 piedras
- Los puntos de pares/juego siempre se cuentan al final; lo apostado se suma al ganador

### Marcador
- Primera a **40 piedras** gana

---

## Arquitectura de Mus.jsx

### Estado principal
```
fase:           "inicio"|"mus"|"descarte"|"apuesta"|"declarar_pares"|"declarar_juego"|"puntos"|"fin"
faseApuesta:    "grande"|"chica"|"pares"|"juego"
manoJugador:    array de 4 cartas [{palo, valor}]
manoBot:        array de 4 cartas [{palo, valor}]
boteJugador:    piedras ganadas en la mano actual (se acumulan al final)
boteBot:        ídem para el bot
apuestaExtraPares:  {quien, extra} — lo apostado en pares (se suma al final)
apuestaExtraJuego:  {quien, extra} — lo apostado en juego (se suma al final)
grandeApostado: boolean — si hubo apuesta en grande (para saber si contar punto en paso)
chicaApostado:  boolean — ídem para chica
```

### Refs
Se usan refs para acceder al estado actual dentro de callbacks async (evitar stale closures):
`manoJRef`, `manoBRef`, `boteJRef`, `boteBRef`, `ptJRef`, `ptBRef`,
`faseApuestaRef`, `apuestaExtraParesRef`, `apuestaExtraJuegoRef`,
`grandeApostadoRef`, `chicaApostadoRef`

### Funciones clave
- `compararManos(manoA, manoB, tipo)` — compara carta a carta para grande/chica
- `tienePareja(mano)` → `"pareja"|"medias"|"duples"|null`
- `valorPareja(mano)` — valor numérico para comparar pares entre sí
- `tieneJuego(mano)` — true si suma ≥ 31
- `valorJuego(mano)` — 10000 si 31 real, 9999 si 31, 9998 si 32, resto = puntos
- `es31Real(mano)` — true si exactamente tres 7s y una Sota
- `resolverPunto()` — resuelve todos los puntos al final de la mano
- `avanzarFase(tipoActual)` — pasa al siguiente lance (gestiona declaraciones)
- `consultarIA(prompt)` — llama al proxy → Anthropic API, devuelve JSON

### IA del bot
Cada decisión del bot (¿mus?, descarte, declaración, apuesta) hace una llamada
a Claude Sonnet con el contexto de su mano y el marcador. El bot:
- Conoce las reglas completas (incluyendo que las declaraciones son honestas)
- Puede farolear en las apuestas (envido con mala mano, etc.)
- Adapta su agresividad según el marcador
- Siempre responde JSON; el código tiene fallback si la llamada falla

---

## Pendiente / posibles mejoras
- Sonidos o animaciones en las jugadas
- Historial detallado de manos
- Modo 4 jugadores (2 vs 2 en parejas)
- Dificultad configurable del bot
