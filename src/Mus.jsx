import { useState, useEffect, useCallback, useRef } from "react";

// ── CONSTANTES ────────────────────────────────────────────────────────────────
const PALOS = ["oros", "copas", "espadas", "bastos"];
const VALORES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const NOMBRES_VALOR = { 1: "As", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 10: "Sota", 11: "Caballo", 12: "Rey" };
const PALO_EMOJI = { oros: "🟡", copas: "🔴", espadas: "⚔️", bastos: "🪵" };
const PALO_COLOR = { oros: "#F6C90E", copas: "#E63946", espadas: "#5B9BD5", bastos: "#5A9E52" };

// ── LÓGICA ────────────────────────────────────────────────────────────────────
function crearBaraja() {
  const b = [];
  for (const p of PALOS) for (const v of VALORES) b.push({ palo: p, valor: v });
  return b;
}
function barajar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function repartir() {
  const b = barajar(crearBaraja());
  return { jugador: b.slice(0, 4), bot: b.slice(4, 8) };
}
// En el mus: 3 equivale a Rey (valor 10 en grande/chica, y cuenta como Rey en pares)
//            2 equivale a As (valor 1 en grande/chica, y cuenta como As en pares)
function puntosValor(v) {
  if (v === 3) return 10;       // 3 = Rey a efectos de puntos
  if (v === 2) return 1;        // 2 = As a efectos de puntos (ya vale 1, pero explícito)
  if (v >= 10) return 10;       // Sota, Caballo, Rey
  return v;
}
function valorPares(v) {
  if (v === 3 || v === 12) return 12;  // 3 y Rey son equivalentes
  if (v === 2 || v === 1) return 1;    // 2 y As son equivalentes
  return v;
}
function puntosMano(mano) { return mano.reduce((s, c) => s + puntosValor(c.valor), 0); }
function tieneJuego(mano) { return puntosMano(mano) >= 31; }

// 31 real: exactamente tres 7s y una Sota (7+7+7+10=31)
function es31Real(mano) {
  const sietes = mano.filter(c => c.valor === 7).length;
  const sotas = mano.filter(c => c.valor === 10).length;
  return sietes === 3 && sotas === 1;
}

function valorJuego(mano) {
  const p = puntosMano(mano);
  if (!tieneJuego(mano)) return 0;
  if (es31Real(mano)) return 10000;  // 31 real gana a todo
  if (p === 31) return 9999;
  if (p === 32) return 9998;
  return p;
}
// Orden de cartas para grande y chica
// R(12)/3 y A(1)/2 son equivalentes entre sí
function rangoGrande(v) {
  // Mayor rango = mejor para grande
  if (v === 12 || v === 3) return 8;  // R/3 mejores
  if (v === 11) return 7;             // C
  if (v === 10) return 6;             // S
  if (v === 7)  return 5;
  if (v === 6)  return 4;
  if (v === 5)  return 3;
  if (v === 4)  return 2;
  if (v === 1 || v === 2) return 1;   // A/2 peores
  return 0;
}
function rangoChica(v) {
  // Mayor rango = peor para chica (queremos los menores)
  return rangoGrande(v); // mismo orden, pero comparamos al revés
}

// Compara dos manos carta a carta para grande (desc) o chica (asc)
// Devuelve 1 si manoA gana, -1 si manoB gana, 0 si empate (gana mano = jugador)
function compararManos(manoA, manoB, tipo) {
  const rankFn = tipo === "grande" ? rangoGrande : rangoChica;
  const sortDir = tipo === "grande" ? -1 : 1; // grande: desc, chica: asc
  const sortedA = [...manoA].sort((a, b) => sortDir * (rankFn(b.valor) - rankFn(a.valor)));
  const sortedB = [...manoB].sort((a, b) => sortDir * (rankFn(b.valor) - rankFn(a.valor)));
  for (let i = 0; i < 4; i++) {
    const rA = rankFn(sortedA[i].valor);
    const rB = rankFn(sortedB[i].valor);
    if (rA !== rB) return tipo === "grande" ? (rA > rB ? 1 : -1) : (rA < rB ? 1 : -1);
  }
  return 0; // empate → gana mano (jugador)
}

function tienePareja(mano) {
  const g = {};
  for (const c of mano) { const k = valorPares(c.valor); g[k] = (g[k] || 0) + 1; }
  const counts = Object.values(g).sort((a, b) => b - a);
  if (counts[0] >= 4) return "duples";                              // RRRR = duples (pareja doble)
  if (counts[0] >= 3) return "medias";                              // 3 iguales = medias (2 pts)
  if (counts[0] >= 2 && (counts[1] || 0) >= 2) return "duples";   // 2 parejas distintas = duples (3 pts)
  if (counts[0] >= 2) return "pareja";                              // 1 pareja (1 pt)
  return null;
}
function valorPareja(mano) {
  const g = {};
  for (const c of mano) { const k = valorPares(c.valor); g[k] = (g[k] || 0) + 1; }
  const orden = { duples: 3, medias: 2, pareja: 1 };
  const tipo = tienePareja(mano);
  if (!tipo) return 0;
  const entries = Object.entries(g).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  return orden[tipo] * 1000 + parseInt(entries[0][0]);
}
function manoATexto(mano) {
  return mano.map(c => `${NOMBRES_VALOR[c.valor]} de ${c.palo}`).join(", ");
}

// ── IA CON CLAUDE API ─────────────────────────────────────────────────────────
async function consultarIA(prompt) {
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
Reglas de cartas: en el mus los 3 equivalen a Reyes (valen 10 puntos y cuentan como Reyes en pares), los 2 equivalen a Ases (valen 1 punto y cuentan como Ases en pares). Sotas y Caballos tienen valor propio (10 y 10 pts respectivamente... espera: Sota=10, Caballo=10, Rey=10, 3=10; As=1, 2=1).
Lances: Grande (gana quien tenga la carta más alta según R/3>C>S>7>6>5>4>A/2, comparando carta a carta de mayor a menor; en empate gana el mano), Chica (gana quien tenga la carta más baja según A/2<4<5<6<7<S<C<R/3, comparando carta a carta de menor a mayor; en empate gana el mano), Pares (duples > medias > pareja; duples=2 parejas sean iguales o distintas=3pts, medias=3 iguales=2pts, pareja=2 iguales=1pt; en empate gana el de mayor valor de carta), Juego (necesitas 31+ puntos; la 31 real = tres 7s y una Sota es la mejor jugada de juego y gana a cualquier otro 31 incluso al mano; luego 31 normal, luego 32, luego de mayor a menor).
Las declaraciones de pares y juego son OBLIGATORIAMENTE honestas, no se puede mentir.
Juegas estratégicamente según el marcador, con faroles en las apuestas cuando conviene.`,
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

// ── COMPONENTE CARTA ──────────────────────────────────────────────────────────
function Carta({ carta, oculta = false, seleccionada = false, onClick = null }) {
  if (oculta) {
    return (
      <div style={{
        width: 68, height: 98, borderRadius: 10, flexShrink: 0,
        background: "repeating-linear-gradient(45deg,#0f2744 0px,#0f2744 5px,#0d1f38 5px,#0d1f38 10px)",
        border: "2px solid #1e4a7a",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
      }}>🂠</div>
    );
  }
  const color = PALO_COLOR[carta.palo];
  return (
    <div onClick={onClick} style={{
      width: 78, height: 112, borderRadius: 10, flexShrink: 0,
      background: seleccionada ? `linear-gradient(160deg,${color}22,${color}44)` : "linear-gradient(160deg,#fff,#f2ede0)",
      border: seleccionada ? `3px solid ${color}` : "2px solid #c8b89a",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "space-between", padding: "5px 3px",
      cursor: onClick ? "pointer" : "default",
      transition: "all 0.15s ease",
      transform: seleccionada ? "translateY(-12px) scale(1.05)" : "none",
      boxShadow: seleccionada ? `0 10px 28px ${color}55` : "0 3px 10px rgba(0,0,0,0.25)",
      userSelect: "none"
    }}>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: "Georgia,serif", lineHeight: 1 }}>
        {NOMBRES_VALOR[carta.valor]}
      </div>
      <div style={{ fontSize: 30, lineHeight: 1 }}>{PALO_EMOJI[carta.palo]}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: "Georgia,serif", transform: "rotate(180deg)", lineHeight: 1 }}>
        {NOMBRES_VALOR[carta.valor]}
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function Mus() {
  const [fase, setFase] = useState("inicio");
  const [faseApuesta, setFaseApuesta] = useState("grande");
  const [manoJugador, setManoJugador] = useState([]);
  const [manoBot, setManoBot] = useState([]);
  const [cartasSeleccionadas, setCartasSeleccionadas] = useState([]);
  const [puntosJugador, setPuntosJugador] = useState(0);
  const [puntosBot, setPuntosBot] = useState(0);
  const [boteJugador, setBoteJugador] = useState(0);
  const [boteBot, setBoteBot] = useState(0);
  const [mensajes, setMensajes] = useState([]);
  const [musRechazado, setMusRechazado] = useState(false);
  const [mostrarBotCartas, setMostrarBotCartas] = useState(false);
  const [ganador, setGanador] = useState(null);
  const [esperandoBot, setEsperandoBot] = useState(false);
  const [apuestaAbierta, setApuestaAbierta] = useState(null);
  const [declaracionJugador, setDeclaracionJugador] = useState(null);
  const [declaracionBot, setDeclaracionBot] = useState(null);
  const [historial, setHistorial] = useState([]);
  // Extra apostado en pares/juego (se suma a puntos base al final)
  const [apuestaExtraPares, setApuestaExtraPares] = useState(null); // {quien, extra}
  const [apuestaExtraJuego, setApuestaExtraJuego] = useState(null); // {quien, extra}
  // Rastrear si grande/chica tuvieron apuesta o quedaron en paso
  const [grandeApostado, setGrandeApostado] = useState(false);
  const [chicaApostado, setChicaApostado] = useState(false);
  // Quién es mano (primer jugador en hablar en cada lance; gana los empates)
  const [esManoJugador, setEsManoJugador] = useState(true);
  // Apuesta extra de punto (se suma al base 1 del ganador al final)
  const [apuestaExtraPunto, setApuestaExtraPunto] = useState(null); // {quien, extra}
  // Resumen del conteo al final de cada mano
  const [resumenMano, setResumenMano] = useState([]);

  // Refs para evitar stale closures en callbacks async
  const manoJRef = useRef([]);
  const manoBRef = useRef([]);
  const boteJRef = useRef(0);
  const boteBRef = useRef(0);
  const ptJRef = useRef(0);
  const ptBRef = useRef(0);
  const faseApuestaRef = useRef("grande");

  useEffect(() => { manoJRef.current = manoJugador; }, [manoJugador]);
  useEffect(() => { manoBRef.current = manoBot; }, [manoBot]);
  useEffect(() => { boteJRef.current = boteJugador; }, [boteJugador]);
  useEffect(() => { boteBRef.current = boteBot; }, [boteBot]);
  useEffect(() => { ptJRef.current = puntosJugador; }, [puntosJugador]);
  useEffect(() => { ptBRef.current = puntosBot; }, [puntosBot]);
  useEffect(() => { faseApuestaRef.current = faseApuesta; }, [faseApuesta]);
  const apuestaExtraParesRef = useRef(null);
  const apuestaExtraJuegoRef = useRef(null);
  const grandeApostadoRef = useRef(false);
  const chicaApostadoRef = useRef(false);
  useEffect(() => { apuestaExtraParesRef.current = apuestaExtraPares; }, [apuestaExtraPares]);
  useEffect(() => { apuestaExtraJuegoRef.current = apuestaExtraJuego; }, [apuestaExtraJuego]);
  useEffect(() => { grandeApostadoRef.current = grandeApostado; }, [grandeApostado]);
  useEffect(() => { chicaApostadoRef.current = chicaApostado; }, [chicaApostado]);
  const esManoJRef = useRef(true);
  useEffect(() => { esManoJRef.current = esManoJugador; }, [esManoJugador]);
  const apuestaExtraPuntoRef = useRef(null);
  useEffect(() => { apuestaExtraPuntoRef.current = apuestaExtraPunto; }, [apuestaExtraPunto]);
  const grandeResultadoRef = useRef(null);
  const chicaResultadoRef = useRef(null);

  const log = useCallback((msg, tipo = "info") => {
    setMensajes(prev => [...prev.slice(-30), { msg, tipo, id: Date.now() + Math.random() }]);
  }, []);

  // ── NUEVA MANO ──────────────────────────────────────────────────────────────
  const nuevaMano = useCallback(() => {
    const { jugador, bot } = repartir();
    setManoJugador(jugador);
    setManoBot(bot);
    setCartasSeleccionadas([]);
    setMusRechazado(false);
    setMostrarBotCartas(false);
    setBoteJugador(0);
    setBoteBot(0);
    setApuestaAbierta(null);
    setDeclaracionJugador(null);
    setDeclaracionBot(null);
    setFaseApuesta("grande");
    setFase("mus");
    setEsperandoBot(false);
    setApuestaExtraPares(null);
    setApuestaExtraJuego(null);
    setApuestaExtraPunto(null);
    setGrandeApostado(false);
    setChicaApostado(false);
    setResumenMano([]);
    grandeResultadoRef.current = null;
    chicaResultadoRef.current = null;
    log("🃏 Cartas repartidas. ¿Mus o no hay mus?", "sistema");
  }, [log]);

  const iniciar = () => {
    setPuntosJugador(0);
    setPuntosBot(0);
    setHistorial([]);
    setGanador(null);
    setEsManoJugador(true);
    esManoJRef.current = true;
    nuevaMano();
  };

  // ── MUS ─────────────────────────────────────────────────────────────────────
  const pedirMus = async () => {
    log("Tú: Mus", "jugador");
    setEsperandoBot(true);
    const manoB = manoBRef.current;
    const resp = await consultarIA(`Tu mano: ${manoATexto(manoB)}.
El rival pide mus. ¿Aceptas? Considera si tu mano es mejorable.
Responde JSON: {"quiereMus": true/false, "razon": "breve"}`);
    setEsperandoBot(false);
    const quiere = resp ? resp.quiereMus : Math.random() > 0.35;
    if (quiere) {
      log(`Bot: Mus ✓${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      setFase("descarte");
      log("Selecciona cartas a descartar y pulsa 'Descartar'", "sistema");
    } else {
      log(`Bot: No hay mus${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      setMusRechazado(true);
      setFaseApuesta("grande");
      setFase("apuesta");
      log("── GRANDE: ¿Paso o envido? ──", "sistema");
    }
  };

  const noHayMus = () => {
    log("Tú: No hay mus", "jugador");
    setMusRechazado(true);
    setFaseApuesta("grande");
    setFase("apuesta");
    log("── GRANDE: ¿Paso o envido? ──", "sistema");
  };

  // ── DESCARTE ────────────────────────────────────────────────────────────────
  const toggleSeleccion = (i) => {
    setCartasSeleccionadas(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  };

  const descartar = async () => {
    const baraja = barajar(crearBaraja());
    let idx = 0;
    const nuevasJ = manoJugador.map((c, i) => cartasSeleccionadas.includes(i) ? baraja[idx++] : c);
    log(`Tú: Descartas ${cartasSeleccionadas.length} carta(s)`, "jugador");
    setEsperandoBot(true);
    const manoB = manoBRef.current;
    const resp = await consultarIA(`Tu mano: ${manoATexto(manoB)}.
¿Qué cartas descartarías para mejorar tus opciones en grande, chica, pares y juego?
Responde JSON: {"indicesToDescartar": [0-3], "razon": "breve"}`);
    setEsperandoBot(false);
    const indices = resp?.indicesToDescartar?.filter(i => i >= 0 && i < 4) || [];
    const baraja2 = barajar(crearBaraja());
    let idx2 = 0;
    const nuevasB = manoB.map((c, i) => indices.includes(i) ? baraja2[idx2++] : c);
    log(`Bot: Descarta ${indices.length}${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
    setManoJugador(nuevasJ);
    setManoBot(nuevasB);
    setCartasSeleccionadas([]);
    setMusRechazado(false);
    setFase("mus");
    log("¿Otra vez mus?", "sistema");
  };

  const noDescartar = () => {
    setCartasSeleccionadas([]);
    log("Tú: No descartas nada", "jugador");
    setFase("mus");
  };

  // ── HELPERS DE APUESTA ───────────────────────────────────────────────────────
  const contextoApuesta = (tipo, manoB) => {
    const manoInfo = !esManoJRef.current
      ? "Eres el MANO (en empate, ganas)."
      : "Eres el POSTRE (el rival es mano; en empate, pierdes).";
    if (tipo === "grande") return `Grande (más puntos gana). Tus puntos: ${puntosMano(manoB)}. ${manoInfo}`;
    if (tipo === "chica") return `Chica (menos puntos gana). Tus puntos: ${puntosMano(manoB)}. ${manoInfo}`;
    if (tipo === "pares") return `Pares. Tienes: ${tienePareja(manoB) || "sin pares"}. ${manoInfo}`;
    if (tipo === "juego") return `Juego. Tienes juego: ${tieneJuego(manoB)}. Puntos: ${puntosMano(manoB)}. ${manoInfo}`;
    if (tipo === "punto") return `Punto (más puntos gana, máximo 30). Tus puntos: ${puntosMano(manoB)}. ${manoInfo}`;
    return "";
  };

  // ── APUESTAS ─────────────────────────────────────────────────────────────────

  // Jugador pasa — bot responde (puede pasar o abrir)
  const jugadorPasa = async () => {
    log("Tú: Paso", "jugador");
    setEsperandoBot(true);
    const tipo = faseApuestaRef.current;
    const manoB = manoBRef.current;
    const resp = await consultarIA(`Fase ${tipo}. ${contextoApuesta(tipo, manoB)}
El rival ha pasado. Marcador: tú ${boteBRef.current + ptBRef.current}, rival ${boteJRef.current + ptJRef.current} piedras.
¿Abres la apuesta o también pasas?
JSON: {"accion": "paso"|"envido", "cantidad": 2/4/999, "razon": "breve"}`);
    setEsperandoBot(false);
    if (!resp || resp.accion === "paso") {
      log(`Bot: Paso${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      avanzarFase(tipo);
    } else {
      const c = resp.cantidad === 999 ? 999 : (resp.cantidad >= 4 ? 4 : 2);
      log(`Bot: ${c === 999 ? "Órdago" : `Envido (${c})`}${resp.razon ? ` — ${resp.razon}` : ""}`, "bot");
      if (tipo === "grande") setGrandeApostado(true);
      if (tipo === "chica") setChicaApostado(true);
      setApuestaAbierta({ cantidad: c, quien: "bot" });
    }
  };

  // Jugador envida — bot responde
  const jugadorEnvido = async (cantidad) => {
    log(`Tú: ${cantidad === 999 ? "Órdago" : `Envido (${cantidad})`}`, "jugador");
    setEsperandoBot(true);
    const tipo = faseApuestaRef.current;
    if (tipo === "grande") setGrandeApostado(true);
    if (tipo === "chica") setChicaApostado(true);
    const manoB = manoBRef.current;
    const resp = await consultarIA(`Fase ${tipo}. ${contextoApuesta(tipo, manoB)}
El rival ${cantidad === 999 ? "ha tirado un órdago" : `ha enviado ${cantidad} piedras`}. Marcador: tú ${boteBRef.current + ptBRef.current}, rival ${boteJRef.current + ptJRef.current} piedras.
IMPORTANTE: si no quieres, el rival solo gana 1 piedra ("porque no"), no las apostadas. Si quieres, se comparan manos y gana el mejor.
JSON: {"accion": "quiero"|"noquiero"|"subir", "cantidad": si subes pon el nuevo total, "razon": "breve"}`);
    setEsperandoBot(false);
    if (!resp || resp.accion === "quiero") {
      log(`Bot: Quiero${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      resolverApuesta(tipo, cantidad);
    } else if (resp.accion === "subir" && cantidad !== 999) {
      const nueva = Math.max((resp.cantidad || cantidad + 2), cantidad + 1);
      log(`Bot: Envido (${nueva})${resp.razon ? ` — ${resp.razon}` : ""}`, "bot");
      setApuestaAbierta({ cantidad: nueva, quien: "bot" });
    } else {
      log(`Bot: No quiero${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      // El que envida gana el lance: cobra 1 (porque no) + su propia base, sin comparación
      if (tipo === "pares") {
        const base = puntosParesSinOponente(manoJRef.current);
        const total = 1 + base;
        setBoteJugador(prev => prev + total);
        log(`✅ No quiero: tú ganas ${total} en pares (1 porque no + ${base} base)`, "exito");
        setApuestaExtraPares({ quien: "jugador", extra: 0, resuelto: true, pts: total });
      } else if (tipo === "juego") {
        const base = puntosJuegoSinOponente(manoJRef.current);
        const total = 1 + base;
        setBoteJugador(prev => prev + total);
        log(`✅ No quiero: tú ganas ${total} en juego (1 porque no + ${base} base)`, "exito");
        setApuestaExtraJuego({ quien: "jugador", extra: 0, resuelto: true, pts: total });
      } else if (tipo === "punto") {
        setBoteJugador(prev => prev + 2);
        log(`✅ No quiero: tú ganas 2 en punto (1 porque no + 1 base)`, "exito");
        setApuestaExtraPunto({ quien: "jugador", extra: 0, resuelto: true, pts: 2 });
      } else {
        setBoteJugador(prev => prev + 1);
        log(`✅ Tú ganas 1 piedra (porque no) en ${tipo}`, "exito");
        if (tipo === "grande") grandeResultadoRef.current = { quien: "jugador", pts: 1 };
        if (tipo === "chica") chicaResultadoRef.current = { quien: "jugador", pts: 1 };
      }
      setApuestaAbierta(null);
      avanzarFase(tipo);
    }
  };

  // Jugador quiere/no quiere la apuesta del bot
  const jugadorQuiere = () => {
    log("Tú: Quiero", "jugador");
    resolverApuesta(faseApuestaRef.current, apuestaAbierta.cantidad);
  };
  const jugadorNoQuiere = () => {
    log("Tú: No quiero", "jugador");
    const tipo = faseApuestaRef.current;
    // El que envida (bot) gana el lance: cobra 1 (porque no) + su propia base, sin comparación
    if (tipo === "pares") {
      const base = puntosParesSinOponente(manoBRef.current);
      const total = 1 + base;
      setBoteBot(prev => prev + total);
      log(`❌ No quiero: bot gana ${total} en pares (1 porque no + ${base} base)`, "error");
      setApuestaExtraPares({ quien: "bot", extra: 0, resuelto: true, pts: total });
    } else if (tipo === "juego") {
      const base = puntosJuegoSinOponente(manoBRef.current);
      const total = 1 + base;
      setBoteBot(prev => prev + total);
      log(`❌ No quiero: bot gana ${total} en juego (1 porque no + ${base} base)`, "error");
      setApuestaExtraJuego({ quien: "bot", extra: 0, resuelto: true, pts: total });
    } else if (tipo === "punto") {
      setBoteBot(prev => prev + 2);
      log(`❌ No quiero: bot gana 2 en punto (1 porque no + 1 base)`, "error");
      setApuestaExtraPunto({ quien: "bot", extra: 0, resuelto: true, pts: 2 });
    } else {
      setBoteBot(prev => prev + 1);
      log(`❌ Bot gana 1 piedra (porque no) en ${tipo}`, "error");
      if (tipo === "grande") grandeResultadoRef.current = { quien: "bot", pts: 1 };
      if (tipo === "chica") chicaResultadoRef.current = { quien: "bot", pts: 1 };
    }
    setApuestaAbierta(null);
    avanzarFase(tipo);
  };

  // Jugador sube la apuesta del bot
  const jugadorSube = async (nueva) => {
    log(`Tú: Envido (${nueva})`, "jugador");
    setEsperandoBot(true);
    const tipo = faseApuestaRef.current;
    const manoB = manoBRef.current;
    const resp = await consultarIA(`Fase ${tipo}. ${contextoApuesta(tipo, manoB)}
El rival ha subido la apuesta a ${nueva} piedras. Si no quieres, el rival gana 1 piedra "porque no". ¿Aceptas?
JSON: {"accion": "quiero"|"noquiero", "razon": "breve"}`);
    setEsperandoBot(false);
    if (!resp || resp.accion === "quiero") {
      log(`Bot: Quiero${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      resolverApuesta(tipo, nueva);
    } else {
      log(`Bot: No quiero${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      // El que envida (jugador) gana el lance: cobra 1 (porque no) + su propia base, sin comparación
      if (tipo === "pares") {
        const base = puntosParesSinOponente(manoJRef.current);
        const total = 1 + base;
        setBoteJugador(prev => prev + total);
        log(`✅ No quiero: tú ganas ${total} en pares (1 porque no + ${base} base)`, "exito");
        setApuestaExtraPares({ quien: "jugador", extra: 0, resuelto: true, pts: total });
      } else if (tipo === "juego") {
        const base = puntosJuegoSinOponente(manoJRef.current);
        const total = 1 + base;
        setBoteJugador(prev => prev + total);
        log(`✅ No quiero: tú ganas ${total} en juego (1 porque no + ${base} base)`, "exito");
        setApuestaExtraJuego({ quien: "jugador", extra: 0, resuelto: true, pts: total });
      } else if (tipo === "punto") {
        setBoteJugador(prev => prev + 2);
        log(`✅ No quiero: tú ganas 2 en punto (1 porque no + 1 base)`, "exito");
        setApuestaExtraPunto({ quien: "jugador", extra: 0, resuelto: true, pts: 2 });
      } else {
        setBoteJugador(prev => prev + 1);
        log(`✅ Tú ganas 1 piedra (porque no) en ${tipo}`, "exito");
        if (tipo === "grande") grandeResultadoRef.current = { quien: "jugador", pts: 1 };
        if (tipo === "chica") chicaResultadoRef.current = { quien: "jugador", pts: 1 };
      }
      setApuestaAbierta(null);
      avanzarFase(tipo);
    }
  };

  // ── PUNTOS AUTOMÁTICOS PARES/JUEGO SIN OPONENTE ──────────────────────────────
  function puntosParesSinOponente(mano) {
    const tipo = tienePareja(mano);
    if (tipo === "pareja") return 1;
    if (tipo === "medias") return 2;   // 3 iguales
    if (tipo === "duples") return 3;   // 2 parejas (distintas o iguales)
    return 0;
  }
  function puntosJuegoSinOponente(mano) {
    if (!tieneJuego(mano)) return 0;
    return puntosMano(mano) === 31 ? 3 : 2;
  }

  // ── RESOLVER COMPARACIÓN ────────────────────────────────────────────────────
  const resolverApuesta = (tipo, cantidad) => {
    const mJ = manoJRef.current, mB = manoBRef.current;
    let jugGana = false, desc = "";
    if (tipo === "grande") {
      const cmp = compararManos(mJ, mB, "grande");
      jugGana = cmp > 0 || (cmp === 0 && esManoJRef.current); // empate → gana el mano
      desc = `Grande: tú ${cmp > 0 ? "ganas" : cmp < 0 ? "pierdes" : "empatas (mano)"}`;
    } else if (tipo === "chica") {
      const cmp = compararManos(mJ, mB, "chica");
      jugGana = cmp > 0 || (cmp === 0 && esManoJRef.current);
      desc = `Chica: tú ${cmp > 0 ? "ganas" : cmp < 0 ? "pierdes" : "empatas (mano)"}`;
    } else if (tipo === "pares") {
      const vJ = valorPareja(mJ), vB = valorPareja(mB);
      jugGana = vJ > vB || (vJ === vB && esManoJRef.current);
      desc = `Tú: ${tienePareja(mJ) || "sin pares"} vs Bot: ${tienePareja(mB) || "sin pares"}`;
    } else if (tipo === "juego") {
      const vJ = valorJuego(mJ), vB = valorJuego(mB);
      jugGana = vJ > vB || (vJ === vB && esManoJRef.current);
      desc = `Tú ${puntosMano(mJ)} vs Bot ${puntosMano(mB)}`;
    } else if (tipo === "punto") {
      const vJ = puntosMano(mJ), vB = puntosMano(mB);
      jugGana = vJ > vB || (vJ === vB && esManoJRef.current);
      desc = `Punto: tú ${vJ} vs Bot ${vB}`;
    }
    const cant = cantidad === 999 ? 6 : cantidad;

    if (tipo === "grande" || tipo === "chica") {
      // Grande y chica: el ganador se lleva directamente lo apostado
      if (jugGana) { setBoteJugador(prev => prev + cant); log(`✅ Tú ganas ${cant} en ${tipo} (${desc})`, "exito"); }
      else { setBoteBot(prev => prev + cant); log(`❌ Bot gana ${cant} en ${tipo} (${desc})`, "error"); }
      if (tipo === "grande") grandeResultadoRef.current = { quien: jugGana ? "jugador" : "bot", pts: cant };
      else chicaResultadoRef.current = { quien: jugGana ? "jugador" : "bot", pts: cant };
    } else {
      // Pares, juego y punto: guardar apuesta extra; los puntos base se calculan al final
      const extra = { quien: jugGana ? "jugador" : "bot", extra: cant };
      if (tipo === "pares") {
        setApuestaExtraPares(extra);
        log(`Pares: ${jugGana ? "tú ganas" : "bot gana"} la apuesta (${cant}). Puntos base se cuentan al final. (${desc})`, jugGana ? "exito" : "error");
      } else if (tipo === "juego") {
        setApuestaExtraJuego(extra);
        log(`Juego: ${jugGana ? "tú ganas" : "bot gana"} la apuesta (${cant}). Puntos base se cuentan al final. (${desc})`, jugGana ? "exito" : "error");
      } else {
        setApuestaExtraPunto(extra);
        log(`Punto: ${jugGana ? "tú ganas" : "bot gana"} la apuesta (${cant}). Base +1 se cuenta al final. (${desc})`, jugGana ? "exito" : "error");
      }
    }
    setApuestaAbierta(null);
    avanzarFase(tipo);
  };

  // ── FIN DE TODOS LOS LANCES: calcular puntos de pares/juego ─────────────────
  const resolverPunto = () => {
    const mJ = manoJRef.current, mB = manoBRef.current;
    const jTieneJuego = tieneJuego(mJ), bTieneJuego = tieneJuego(mB);
    const _res = [];

    // ── Grande ──
    {
      const cmp = compararManos(mJ, mB, "grande");
      const jugGana = cmp > 0 || (cmp === 0 && esManoJRef.current);
      if (!grandeApostadoRef.current) {
        if (jugGana) { setBoteJugador(prev => prev + 1); log(`Grande (paso): tú ganas 1 punto`, "exito"); }
        else { setBoteBot(prev => prev + 1); log(`Grande (paso): bot gana 1 punto`, "error"); }
        _res.push({ lance: "Grande", quien: jugGana ? "jugador" : "bot", pts: 1, info: "paso" });
      } else {
        const r = grandeResultadoRef.current;
        if (r) _res.push({ lance: "Grande", quien: r.quien, pts: r.pts, info: "apostado" });
      }
    }

    // ── Chica ──
    {
      const cmp = compararManos(mJ, mB, "chica");
      const jugGana = cmp > 0 || (cmp === 0 && esManoJRef.current);
      if (!chicaApostadoRef.current) {
        if (jugGana) { setBoteJugador(prev => prev + 1); log(`Chica (paso): tú ganas 1 punto`, "exito"); }
        else { setBoteBot(prev => prev + 1); log(`Chica (paso): bot gana 1 punto`, "error"); }
        _res.push({ lance: "Chica", quien: jugGana ? "jugador" : "bot", pts: 1, info: "paso" });
      } else {
        const r = chicaResultadoRef.current;
        if (r) _res.push({ lance: "Chica", quien: r.quien, pts: r.pts, info: "apostado" });
      }
    }

    // ── Pares ──
    const jPares = tienePareja(mJ), bPares = tienePareja(mB);
    if (jPares || bPares) {
      if (apuestaExtraParesRef.current?.resuelto) {
        const r = apuestaExtraParesRef.current;
        _res.push({ lance: "Pares", quien: r.quien, pts: r.pts || 0, info: "no quiero" });
      } else {
        const extraPares = apuestaExtraParesRef.current;
        let ganadorPares, ptsBase;
        if (jPares && !bPares) {
          ganadorPares = "jugador"; ptsBase = puntosParesSinOponente(mJ);
        } else if (bPares && !jPares) {
          ganadorPares = "bot"; ptsBase = puntosParesSinOponente(mB);
        } else {
          const vJ = valorPareja(mJ), vB = valorPareja(mB);
          ganadorPares = vJ > vB ? "jugador" : vJ < vB ? "bot" : (esManoJRef.current ? "jugador" : "bot");
          ptsBase = ganadorPares === "jugador" ? puntosParesSinOponente(mJ) : puntosParesSinOponente(mB);
        }
        const extra = extraPares?.quien === ganadorPares ? extraPares.extra : 0;
        const total = ptsBase + extra;
        if (ganadorPares === "jugador") {
          setBoteJugador(prev => prev + total);
          log(`Pares: tú ganas ${total} (base ${ptsBase}${extra > 0 ? ` + ${extra} apostado` : ""})`, "exito");
        } else {
          setBoteBot(prev => prev + total);
          log(`Pares: bot gana ${total} (base ${ptsBase}${extra > 0 ? ` + ${extra} apostado` : ""})`, "error");
        }
        _res.push({ lance: "Pares", quien: ganadorPares, pts: total, info: extra > 0 ? `base ${ptsBase} + ${extra} ap.` : `base ${ptsBase}` });
        if (extraPares && extraPares.extra > 0 && extraPares.quien !== ganadorPares) {
          if (extraPares.quien === "jugador") {
            setBoteJugador(prev => prev + extraPares.extra);
            log(`Pares: tú cobras +${extraPares.extra} (porque no) aunque el bot tiene mejores pares`, "exito");
          } else {
            setBoteBot(prev => prev + extraPares.extra);
            log(`Pares: bot cobra +${extraPares.extra} (porque no) aunque tú tienes mejores pares`, "error");
          }
        }
      }
    }

    // ── Punto ──
    if (!jTieneJuego && !bTieneJuego) {
      if (apuestaExtraPuntoRef.current?.resuelto) {
        const r = apuestaExtraPuntoRef.current;
        _res.push({ lance: "Punto", quien: r.quien, pts: r.pts || 2, info: "no quiero" });
      } else {
        const vJ = puntosMano(mJ), vB = puntosMano(mB);
        const ganadorPunto = vJ > vB ? "jugador" : vJ < vB ? "bot" : (esManoJRef.current ? "jugador" : "bot");
        const extraPunto = apuestaExtraPuntoRef.current;
        const extra = extraPunto?.quien === ganadorPunto ? extraPunto.extra : 0;
        const total = 1 + extra;
        if (ganadorPunto === "jugador") {
          setBoteJugador(prev => prev + total);
          log(`Punto: tú ganas ${total} (base 1${extra > 0 ? ` + ${extra} apostado` : ""}, tú ${vJ} vs Bot ${vB})`, "exito");
        } else {
          setBoteBot(prev => prev + total);
          log(`Punto: bot gana ${total} (base 1${extra > 0 ? ` + ${extra} apostado` : ""}, tú ${vJ} vs Bot ${vB})`, "error");
        }
        _res.push({ lance: "Punto", quien: ganadorPunto, pts: total, info: `tú ${vJ} vs bot ${vB}` });
        if (extraPunto && extraPunto.extra > 0 && extraPunto.quien !== ganadorPunto) {
          if (extraPunto.quien === "jugador") {
            setBoteJugador(prev => prev + extraPunto.extra);
            log(`Punto: tú cobras +${extraPunto.extra} (porque no) aunque el bot tiene mejor punto`, "exito");
          } else {
            setBoteBot(prev => prev + extraPunto.extra);
            log(`Punto: bot cobra +${extraPunto.extra} (porque no) aunque tú tienes mejor punto`, "error");
          }
        }
      }
    }

    // ── Juego ──
    if (jTieneJuego || bTieneJuego) {
      if (apuestaExtraJuegoRef.current?.resuelto) {
        const r = apuestaExtraJuegoRef.current;
        _res.push({ lance: "Juego", quien: r.quien, pts: r.pts || 0, info: "no quiero" });
      } else {
        const extraJuego = apuestaExtraJuegoRef.current;
        let ganadorJuego, ptsBase;
        if (jTieneJuego && !bTieneJuego) {
          ganadorJuego = "jugador"; ptsBase = puntosJuegoSinOponente(mJ);
        } else if (bTieneJuego && !jTieneJuego) {
          ganadorJuego = "bot"; ptsBase = puntosJuegoSinOponente(mB);
        } else {
          const vJ = valorJuego(mJ), vB = valorJuego(mB);
          ganadorJuego = vJ > vB ? "jugador" : vJ < vB ? "bot" : (esManoJRef.current ? "jugador" : "bot");
          ptsBase = ganadorJuego === "jugador" ? puntosJuegoSinOponente(mJ) : puntosJuegoSinOponente(mB);
        }
        const extra = extraJuego?.quien === ganadorJuego ? extraJuego.extra : 0;
        const total = ptsBase + extra;
        if (ganadorJuego === "jugador") {
          setBoteJugador(prev => prev + total);
          log(`Juego: tú ganas ${total} (base ${ptsBase}${extra > 0 ? ` + ${extra} apostado` : ""})`, "exito");
        } else {
          setBoteBot(prev => prev + total);
          log(`Juego: bot gana ${total} (base ${ptsBase}${extra > 0 ? ` + ${extra} apostado` : ""})`, "error");
        }
        _res.push({ lance: "Juego", quien: ganadorJuego, pts: total, info: extra > 0 ? `base ${ptsBase} + ${extra} ap.` : `base ${ptsBase}` });
        if (extraJuego && extraJuego.extra > 0 && extraJuego.quien !== ganadorJuego) {
          if (extraJuego.quien === "jugador") {
            setBoteJugador(prev => prev + extraJuego.extra);
            log(`Juego: tú cobras +${extraJuego.extra} (porque no) aunque el bot tiene mejor juego`, "exito");
          } else {
            setBoteBot(prev => prev + extraJuego.extra);
            log(`Juego: bot cobra +${extraJuego.extra} (porque no) aunque tú tienes mejor juego`, "error");
          }
        }
      }
    }

    setMostrarBotCartas(true);
    setResumenMano(_res);
    setFase("puntos");
  };

  // ── AVANZAR FASE ─────────────────────────────────────────────────────────────
  const avanzarFase = useCallback(async (tipoActual) => {
    const orden = ["grande", "chica", "pares", "juego"];
    const idx = orden.indexOf(tipoActual);
    if (tipoActual === "punto" || idx >= orden.length - 1) {
      setTimeout(() => resolverPunto(), 400);
      return;
    }
    const siguiente = orden[idx + 1];
    setFaseApuesta(siguiente);

    if (siguiente === "pares") {
      // Fase de declaración
      setDeclaracionJugador(null);
      setDeclaracionBot(null);
      setFase("declarar_pares");
      log("── PARES: ¿Tienes pares? ──", "sistema");
      // Bot declara con IA
      setEsperandoBot(true);
      const manoB = manoBRef.current;
      const tienePB = tienePareja(manoB);
      const resp = await consultarIA(`Tu mano: ${manoATexto(manoB)}.
Tienes que declarar si llevas pares. Tus pares: ${tienePB || "ninguno"}.
REGLA IMPORTANTE: en el mus la declaración es OBLIGATORIAMENTE honesta. Si tienes pares DEBES declarar que los tienes. Si no tienes, DEBES decir que no tienes. No se puede mentir.
JSON: {"declarar": ${tienePB !== null ? "true (tienes pares, debes declarar)" : "false (no tienes pares)"}, "razon": "breve"}`);
      setEsperandoBot(false);
      const declara = tienePB !== null; // Siempre honesto, ignoramos resp.declarar
      log(`Bot: ${declara ? "Tengo pares" : "No tengo pares"}${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      setDeclaracionBot(declara ? "si" : "no");
      return;
    }

    if (siguiente === "juego") {
      setDeclaracionJugador(null);
      setDeclaracionBot(null);
      setFase("declarar_juego");
      log("── JUEGO: ¿Tienes juego? ──", "sistema");
      setEsperandoBot(true);
      const manoB = manoBRef.current;
      const tieneJB = tieneJuego(manoB);
      const resp = await consultarIA(`Tu mano: ${manoATexto(manoB)}.
Tienes que declarar si llevas juego (31+ puntos). Tus puntos: ${puntosMano(manoB)}.
REGLA IMPORTANTE: la declaración es OBLIGATORIAMENTE honesta. Si tienes 31+ puntos DEBES declarar juego. Si no, DEBES decir que no tienes.
JSON: {"declarar": ${tieneJB ? "true (tienes juego, debes declarar)" : "false (no tienes juego)"}, "razon": "breve"}`);
      setEsperandoBot(false);
      const declara = tieneJB; // Siempre honesto, ignoramos resp.declarar
      log(`Bot: ${declara ? "Tengo juego" : "No tengo juego"}${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      setDeclaracionBot(declara ? "si" : "no");
      return;
    }

    // Grande y chica van directo
    setTimeout(() => {
      setFase("apuesta");
      log(`── ${siguiente.toUpperCase()}: ¿Paso o envido? ──`, "sistema");
    }, 400);
  }, [log]);

  // ── DECLARACIÓN DEL JUGADOR ──────────────────────────────────────────────────
  const declarar = (valor) => {
    const tipo = fase === "declarar_pares" ? "pares" : "juego";
    log(`Tú: ${valor === "si" ? `Tengo ${tipo}` : `No tengo ${tipo}`}`, "jugador");
    setDeclaracionJugador(valor);
  };

  // Cuando ambos han declarado → ver si hay apuesta, puntos automáticos o skip
  useEffect(() => {
    if (
      (fase === "declarar_pares" || fase === "declarar_juego") &&
      declaracionJugador !== null && declaracionBot !== null
    ) {
      const tipo = fase === "declarar_pares" ? "pares" : "juego";
      const mJ = manoJRef.current, mB = manoBRef.current;
      const jTiene = declaracionJugador === "si";
      const bTiene = declaracionBot === "si";

      if (!jTiene && !bTiene) {
        // Nadie tiene → saltar fase
        log(`Nadie declara ${tipo} → ${tipo === "pares" ? "pasamos a juego" : "lance de punto"}`, "sistema");
        setTimeout(() => {
          if (tipo === "pares") avanzarFase("pares");
          else {
            setFaseApuesta("punto");
            setFase("apuesta");
            log("── PUNTO: ¿Paso o envido? ──", "sistema");
          }
        }, 600);
      } else if (jTiene && !bTiene) {
        // Solo el jugador tiene → se anotará al final con puntos base en resolverPunto
        log(`Solo tú tienes ${tipo}: los puntos se contarán al final de la mano`, "sistema");
        setTimeout(() => {
          if (tipo === "pares") avanzarFase("pares");
          else resolverPunto();
        }, 700);
      } else if (!jTiene && bTiene) {
        // Solo el bot tiene → se anotará al final con puntos base en resolverPunto
        log(`Solo el bot tiene ${tipo}: los puntos se contarán al final de la mano`, "sistema");
        setTimeout(() => {
          if (tipo === "pares") avanzarFase("pares");
          else resolverPunto();
        }, 700);
      } else {
        // Ambos tienen → apuesta normal
        setTimeout(() => {
          setFase("apuesta");
          log(`── ${tipo.toUpperCase()}: Ambos tienen, apuestas ──`, "sistema");
        }, 400);
      }
    }
  }, [declaracionJugador, declaracionBot, fase]);

  // ── FIN DE MANO ──────────────────────────────────────────────────────────────
  const terminarMano = () => {
    const bJ = boteJRef.current, bB = boteBRef.current;
    const nj = puntosJugador + bJ, nb = puntosBot + bB;
    log(`Mano: +${bJ} para ti, +${bB} para el bot`, "sistema");
    setHistorial(prev => [...prev, { jugador: bJ, bot: bB }]);
    setPuntosJugador(nj);
    setPuntosBot(nb);
    if (nj >= 40) { setGanador("jugador"); setFase("fin"); }
    else if (nb >= 40) { setGanador("bot"); setFase("fin"); }
    else {
      setEsManoJugador(prev => !prev);
      esManoJRef.current = !esManoJRef.current;
      nuevaMano();
    }
  };

  // ── ESTILOS ───────────────────────────────────────────────────────────────────
  const fondo = {
    minHeight: "100vh",
    background: "radial-gradient(ellipse at 15% 20%,#102840 0%,#071828 55%,#030d18 100%)",
    fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,serif",
    color: "#e2cfa0",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "16px 14px", gap: 14
  };
  const panel = {
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(180,140,60,0.2)",
    borderRadius: 14, padding: "14px 18px",
    backdropFilter: "blur(8px)"
  };
  const mkBtn = (accent = "#F6C90E", dark = false) => ({
    padding: "9px 20px", borderRadius: 8, border: "none",
    fontFamily: "inherit", fontSize: 14, fontWeight: 700,
    cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.04em",
    background: dark
      ? `linear-gradient(135deg,${accent}33,${accent}22)`
      : `linear-gradient(135deg,${accent},${accent}bb)`,
    color: dark ? accent : "#0a0a0a",
    border: dark ? `1px solid ${accent}55` : "none",
    boxShadow: `0 3px 12px ${accent}44`
  });
  const titulo = {
    fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 700,
    letterSpacing: "0.2em", color: "#F6C90E",
    textShadow: "0 0 25px rgba(246,201,14,0.45),0 2px 4px rgba(0,0,0,0.9)",
    textTransform: "uppercase", margin: 0
  };

  const etiquetaFase = {
    mus: "¿Mus?", descarte: "Descarte",
    apuesta: faseApuesta.toUpperCase(),
    declarar_pares: "Declaración · PARES",
    declarar_juego: "Declaración · JUEGO",
    puntos: "Fin de mano"
  }[fase] || "";

  // ── PANTALLA INICIO / FIN ────────────────────────────────────────────────────
  if (fase === "inicio" || fase === "fin") {
    return (
      <div style={fondo}>
        <p style={titulo}>🂡 MUS 🂡</p>
        <div style={{ textAlign: "center", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <p style={{ color: "#8a7050", fontSize: 15, lineHeight: 1.7, margin: 0 }}>
            El clásico juego de cartas vasco. Grande · Chica · Pares · Juego.<br />
            <strong style={{ color: "#a89060" }}>Primera a 40 piedras gana.</strong><br />
            <span style={{ fontSize: 13, color: "#6a5030" }}>El bot usa IA para razonar sus jugadas.</span>
          </p>
          {ganador && (
            <div style={{
              padding: "22px 32px", borderRadius: 16, width: "100%",
              background: ganador === "jugador"
                ? "linear-gradient(135deg,rgba(45,158,96,0.25),rgba(26,110,66,0.15))"
                : "linear-gradient(135deg,rgba(230,57,70,0.25),rgba(193,18,31,0.15))",
              border: `2px solid ${ganador === "jugador" ? "#2d9e6099" : "#e6394699"}`
            }}>
              <div style={{ fontSize: 52 }}>{ganador === "jugador" ? "🏆" : "😔"}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                {ganador === "jugador" ? "¡Has ganado!" : "Ha ganado el bot"}
              </div>
              <div style={{ fontSize: 14, color: "#a08060", marginTop: 6 }}>
                {puntosJugador} — {puntosBot} piedras
              </div>
            </div>
          )}
          <button style={{ ...mkBtn(), fontSize: 17, padding: "13px 38px" }} onClick={iniciar}>
            {ganador ? "♻️ Nueva partida" : "🎮 Comenzar partida"}
          </button>
        </div>
      </div>
    );
  }

  // ── PANTALLA DE JUEGO ────────────────────────────────────────────────────────
  const infoManoJ = manoJugador.length > 0
    ? `Grande: ${puntosMano(manoJugador)} · ${tienePareja(manoJugador) || "sin pares"} · ${tieneJuego(manoJugador) ? (es31Real(manoJugador) ? "¡31 real!" : `juego (${puntosMano(manoJugador)})`) : "sin juego"}`
    : "";

  return (
    <div style={fondo}>
      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 680 }}>
        <p style={{ ...titulo, fontSize: "clamp(1.1rem,3.2vw,1.8rem)", flex: 1, margin: 0 }}>🂡 MUS</p>
        <div style={{ fontSize: 11, color: "#F6C90E99", fontWeight: 700, letterSpacing: "0.1em" }}>
          {etiquetaFase}
        </div>
        {[{ l: "TÚ", v: puntosJugador + boteJugador, c: "#F6C90E", esMano: esManoJugador },
          { l: "BOT", v: puntosBot + boteBot, c: "#e63946", esMano: !esManoJugador }].map(({ l, v, c, esMano }) => (
          <div key={l} style={{ ...panel, textAlign: "center", minWidth: 58, padding: "7px 12px", border: esMano ? "1px solid #a080c066" : panel.border }}>
            <div style={{ fontSize: 10, color: "#7a6030" }}>{l}</div>
            {esMano && <div style={{ fontSize: 8, color: "#a080c0", fontWeight: 700, letterSpacing: "0.1em" }}>MANO</div>}
            <div style={{ fontSize: 21, fontWeight: 800, color: c, lineHeight: 1.1 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Mano bot */}
      <div style={{ ...panel, width: "100%", maxWidth: 680 }}>
        <div style={{ fontSize: 11, color: "#7a6030", marginBottom: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <span>MANO DEL BOT{!esManoJugador && <span style={{ color: "#a080c0", fontWeight: 700, marginLeft: 8 }}>(mano)</span>}</span>
          {mostrarBotCartas && (
            <span style={{ color: "#e8a0a0" }}>
              {puntosMano(manoBot)} pts · {tienePareja(manoBot) || "sin pares"} · {tieneJuego(manoBot) ? `juego` : "sin juego"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {manoBot.map((c, i) => <Carta key={i} carta={c} oculta={!mostrarBotCartas} />)}
        </div>
        {(fase === "declarar_pares" || fase === "declarar_juego") && declaracionBot !== null && (
          <div style={{ marginTop: 8, fontSize: 13, color: declaracionBot === "si" ? "#e8b060" : "#809090" }}>
            Bot declara: <strong>{declaracionBot === "si"
              ? `tengo ${fase === "declarar_pares" ? "pares" : "juego"}`
              : "no tengo"}</strong>
          </div>
        )}
      </div>

      {/* Log */}
      <div style={{
        ...panel, width: "100%", maxWidth: 680,
        maxHeight: 120, overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 3
      }} ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
        {mensajes.length === 0 && <span style={{ color: "#4a3820", fontSize: 12 }}>—</span>}
        {mensajes.map(m => (
          <div key={m.id} style={{
            fontSize: 12.5, lineHeight: 1.4,
            color: {
              bot: "#e8a0a0", jugador: "#a0d8a0", sistema: "#F6C90Ecc",
              exito: "#80d8e8", error: "#e88080"
            }[m.tipo] || "#c0b090"
          }}>{m.msg}</div>
        ))}
      </div>

      {/* Mano jugador */}
      <div style={{ ...panel, width: "100%", maxWidth: 680 }}>
        <div style={{ fontSize: 11, color: "#7a6030", marginBottom: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <span>TU MANO{esManoJugador && <span style={{ color: "#a080c0", fontWeight: 700, marginLeft: 8 }}>(mano)</span>}</span>
          {infoManoJ && <span style={{ color: "#F6C90Eaa" }}>{infoManoJ}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {manoJugador.map((c, i) => (
            <Carta key={i} carta={c}
              seleccionada={cartasSeleccionadas.includes(i)}
              onClick={fase === "descarte" ? () => toggleSeleccion(i) : null}
            />
          ))}
        </div>
      </div>

      {/* Resumen de mano */}
      {fase === "puntos" && resumenMano.length > 0 && (
        <div style={{ ...panel, width: "100%", maxWidth: 680, border: "1px solid #F6C90E44" }}>
          <div style={{ fontSize: 11, color: "#F6C90Ecc", fontWeight: 700, letterSpacing: "0.12em", marginBottom: 10 }}>
            RESUMEN DE LA MANO
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {resumenMano.map(({ lance, quien, pts, info }, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span style={{ color: "#7a6030", minWidth: 52, flexShrink: 0 }}>{lance}</span>
                <span style={{ fontWeight: 700, color: quien === "jugador" ? "#80d8a0" : "#e8a0a0" }}>
                  {quien === "jugador" ? "Tú" : "Bot"} +{pts}
                </span>
                {info && <span style={{ fontSize: 11, color: "#5a4820" }}>{info}</span>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(180,140,60,0.15)", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "#a08050" }}>Total mano:</span>
            <span>
              <span style={{ color: "#80d8a0", fontWeight: 700 }}>Tú +{boteJugador}</span>
              <span style={{ color: "#5a4820", margin: "0 6px" }}>·</span>
              <span style={{ color: "#e8a0a0", fontWeight: 700 }}>Bot +{boteBot}</span>
            </span>
          </div>
        </div>
      )}

      {/* Controles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 680 }}>
        {esperandoBot && (
          <div style={{ ...panel, padding: "10px 20px", color: "#a08050", fontSize: 13, width: "100%", textAlign: "center" }}>
            ⏳ El bot está pensando...
          </div>
        )}

        {!esperandoBot && (<>
          {/* MUS */}
          {fase === "mus" && !musRechazado && (<>
            <button style={mkBtn()} onClick={pedirMus}>Mus</button>
            <button style={mkBtn("#8090b0", true)} onClick={noHayMus}>No hay mus</button>
          </>)}

          {/* DESCARTE */}
          {fase === "descarte" && (<>
            <div style={{ width: "100%", textAlign: "center", fontSize: 12, color: "#7a6030" }}>
              Toca las cartas para seleccionarlas
            </div>
            <button style={mkBtn()} onClick={descartar} disabled={cartasSeleccionadas.length === 0}>
              Descartar {cartasSeleccionadas.length > 0 ? `(${cartasSeleccionadas.length})` : ""}
            </button>
            <button style={mkBtn("#8090b0", true)} onClick={noDescartar}>Paso sin descartar</button>
          </>)}

          {/* DECLARACIÓN PARES */}
          {fase === "declarar_pares" && declaracionJugador === null && (<>
            <div style={{ width: "100%", textAlign: "center", fontSize: 13, color: "#c0a060" }}>
              ¿Llevas pares?
              {tienePareja(manoJugador)
                ? <span style={{ color: "#F6C90E" }}> (tienes {tienePareja(manoJugador)})</span>
                : <span style={{ color: "#7a9090" }}> (no tienes pares)</span>}
            </div>
            {tienePareja(manoJugador) && (
              <button style={mkBtn("#2d9e60")} onClick={() => declarar("si")}>Sí, tengo pares</button>
            )}
            <button style={mkBtn("#8090b0", true)} onClick={() => declarar("no")}>No tengo pares</button>
          </>)}

          {/* DECLARACIÓN JUEGO */}
          {fase === "declarar_juego" && declaracionJugador === null && (<>
            <div style={{ width: "100%", textAlign: "center", fontSize: 13, color: "#c0a060" }}>
              ¿Llevas juego? (31+ puntos)
              {tieneJuego(manoJugador)
                ? <span style={{ color: "#F6C90E" }}> (tienes {puntosMano(manoJugador)} puntos)</span>
                : <span style={{ color: "#7a9090" }}> (tienes {puntosMano(manoJugador)} puntos, sin juego)</span>}
            </div>
            {tieneJuego(manoJugador) && (
              <button style={mkBtn("#2d9e60")} onClick={() => declarar("si")}>Sí, tengo juego</button>
            )}
            <button style={mkBtn("#8090b0", true)} onClick={() => declarar("no")}>No tengo juego</button>
          </>)}

          {/* APUESTA — sin apuesta abierta del bot */}
          {fase === "apuesta" && !apuestaAbierta && (<>
            <button style={mkBtn("#6a7a90", true)} onClick={jugadorPasa}>Paso</button>
            <button style={mkBtn("#2d9e60")} onClick={() => jugadorEnvido(2)}>Envido (2)</button>
            <button style={mkBtn("#e88020")} onClick={() => jugadorEnvido(4)}>Envido (4)</button>
            <button style={mkBtn("#e63946")} onClick={() => jugadorEnvido(999)}>Órdago</button>
          </>)}

          {/* APUESTA — responder al bot */}
          {fase === "apuesta" && apuestaAbierta?.quien === "bot" && (<>
            <div style={{ width: "100%", textAlign: "center", fontSize: 13, color: "#e8b060" }}>
              El bot {apuestaAbierta.cantidad === 999 ? "ha tirado un ÓRDAGO 😮" : `ha enviado ${apuestaAbierta.cantidad} piedras`}
            </div>
            <button style={mkBtn("#2d9e60")} onClick={jugadorQuiere}>Quiero</button>
            <button style={mkBtn("#e63946")} onClick={jugadorNoQuiere}>No quiero</button>
            {apuestaAbierta.cantidad < 999 && (
              <button style={mkBtn("#e88020")} onClick={() => jugadorSube(apuestaAbierta.cantidad + 2)}>
                Subir ({apuestaAbierta.cantidad + 2})
              </button>
            )}
          </>)}

          {/* FIN MANO */}
          {fase === "puntos" && (
            <button style={{ ...mkBtn(), padding: "11px 28px" }} onClick={terminarMano}>
              Siguiente mano →
            </button>
          )}
        </>)}
      </div>

      {/* Botes de la mano */}
      {(boteJugador > 0 || boteBot > 0) && fase !== "puntos" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {boteJugador > 0 && (
            <div style={{ ...panel, padding: "5px 12px", background: "rgba(45,158,96,0.1)", border: "1px solid #2d9e6055" }}>
              <span style={{ color: "#80d8a0", fontSize: 12 }}>🪙 Tu bote: +{boteJugador}</span>
            </div>
          )}
          {boteBot > 0 && (
            <div style={{ ...panel, padding: "5px 12px", background: "rgba(230,57,70,0.1)", border: "1px solid #e6394655" }}>
              <span style={{ color: "#e8a0a0", fontSize: 12 }}>🪙 Bote bot: +{boteBot}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
