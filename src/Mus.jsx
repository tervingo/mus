import { useState, useEffect, useCallback, useRef } from "react";
import { heuristicDecide,
         ACT_MUS, ACT_NO_HAY_MUS, ACT_DESCARTAR,
} from './musHeuristic.js';
import {
  crearBaraja, barajar, repartir,
  puntosMano, tieneJuego, es31Real, valorJuego,
  compararManos,
  tienePareja, valorPareja,
  manoATexto, manoOrdenadaGrande, manoOrdenadaChica,
  fuerzaGrande, fuerzaChica,
  puntosParesSinOponente, puntosJuegoSinOponente,
} from './musEngine.js';
import { consultarIA, consultarHeuristica } from './musBot.js';
import Carta from './Carta.jsx';

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function Mus() {
  const [fase, setFase] = useState("inicio");
  const [faseApuesta, setFaseApuesta] = useState("grande");
  const [modoDQN, setModoDQN] = useState(true);
  const modoDQNRef = useRef(true);
  useEffect(() => { modoDQNRef.current = modoDQN; }, [modoDQN]);
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
  const [botPaso, setBotPaso] = useState(false); // el bot es mano y ya pasó
  const [botPidioMus, setBotPidioMus] = useState(false);
  const botMusDecididoRef = useRef(false); // evita que botDecideMus se llame dos veces
  const [declaracionJugador, setDeclaracionJugador] = useState(null);
  const [declaracionBot, setDeclaracionBot] = useState(null);
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
  const [estadoLances, setEstadoLances] = useState({
    grande: null, chica: null, pares: null, juego: null, punto: null
  }); // null = pendiente, {tipo: 'paso'|'envidada'|'no_querida', pts, quien}

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

  // Wrapper: elige entre Claude y heurística según modoDQN
  const botDecide = useCallback(async (prompt, gameStateOverride = null) => {
    if (modoDQNRef.current) {
      const gs = gameStateOverride || {
        manoJugador:   manoBRef.current,
        fase:          faseApuestaRef.current,
        faseApuesta:   faseApuestaRef.current,
        esManoJugador: !esManoJRef.current,
        puntosJugador: ptBRef.current,
        puntosBot:     ptJRef.current,
        apuestaAbierta: null,
        declaracionBot: null,
      };
      return consultarHeuristica(gs);
    }
    return consultarIA(prompt);
  }, [modoDQN]);


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
    setBotPaso(false);
    setBotPidioMus(false);
    botMusDecididoRef.current = false;
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
    setEstadoLances({ grande: null, chica: null, pares: null, juego: null, punto: null });
    grandeResultadoRef.current = null;
    chicaResultadoRef.current = null;
    log("🃏 Cartas repartidas. ¿Mus o no hay mus?", "sistema");
  }, [log]);

  const iniciar = () => {
    setPuntosJugador(0);
    setPuntosBot(0);
    setGanador(null);
    setEsManoJugador(true);
    esManoJRef.current = true;
    nuevaMano();
  };

  // ── MUS ─────────────────────────────────────────────────────────────────────
  // Cuando fase=mus y bot es mano, el bot decide primero si quiere mus
  const botDecideMus = useCallback(async () => {
    const manoB = manoBRef.current;
    let quiere;
    let razonBot = "";

    // Modo desesperado: rival >= 35 y bot < 35 → siendo mano, cortar el mus para ir a apostar
    if (ptJRef.current >= 35 && ptBRef.current < 35) {
      log("Bot: No hay mus", "bot");
      setMusRechazado(true);
      setFaseApuesta("grande");
      setFase("apuesta");
      log("── GRANDE: ¿Paso o envido? ──", "sistema");
      return;
    }
    if (modoDQNRef.current) {
      const legal = [ACT_MUS, ACT_NO_HAY_MUS];
      const accion = heuristicDecide({
        mano: manoB, fase: 'mus', faseApuesta: 'grande',
        esMano: true,
        scoreSelf: ptBRef.current, scoreOpp: ptJRef.current,
        apuestaAbierta: null, cartasSeleccionadas: [],
      }, legal);
      quiere = accion === ACT_MUS;
    } else {
      const fG = fuerzaGrande(manoB);
      const fC = fuerzaChica(manoB);
      const malaGrande = fG === "débil" || fG === "muy débil";
      const malaChica  = fC === "débil" || fC === "muy débil";
      setEsperandoBot(true);
      const resp = await consultarIA(`Tu mano: ${manoATexto(manoB)}.
Eres el MANO. ¿Pides mus? Considera si tu mano es mejorable.
Responde JSON: {"quiereMus": true/false, "razon": "breve"}`);
      setEsperandoBot(false);
      quiere = resp ? resp.quiereMus : (malaGrande || malaChica);
      razonBot = resp?.razon || "";
    }
    if (quiere) {
      log(`Bot: Mus${razonBot ? ` — ${razonBot}` : ""}`, "bot");
      setBotPidioMus(true);
      // Ahora el jugador decide si acepta
    } else {
      log(`Bot: No hay mus${razonBot ? ` — ${razonBot}` : ""}`, "bot");
      setMusRechazado(true);
      setFaseApuesta("grande");
      setFase("apuesta");
      log("── GRANDE: ¿Paso o envido? ──", "sistema");
    }
  }, [log]);

  useEffect(() => {
    if (fase === "mus" && !musRechazado && !esManoJugador && !botMusDecididoRef.current) {
      botMusDecididoRef.current = true;
      botDecideMus();
    }
    if (fase !== "mus") {
      botMusDecididoRef.current = false;
    }
  }, [fase, musRechazado]);

  const pedirMus = async () => {
    log("Tú: Mus", "jugador");
    setEsperandoBot(true);
    const manoB = manoBRef.current;
    let quiere;
 if (modoDQNRef.current) {
      const legal = [ACT_MUS, ACT_NO_HAY_MUS];
      const accion = heuristicDecide({
        mano: manoB, fase: 'mus', faseApuesta: 'grande',
        esMano: !esManoJRef.current,
        scoreSelf: ptBRef.current, scoreOpp: ptJRef.current,
        apuestaAbierta: null, cartasSeleccionadas: [],
      }, legal);
      quiere = accion === ACT_MUS;
      setEsperandoBot(false);
    } else {
      const desesperado = ptJRef.current >= 35 && ptBRef.current < 35;
      const resp = await consultarIA(`Tu mano: ${manoATexto(manoB)}.
El rival pide mus. ¿Aceptas? Considera si tu mano es mejorable.${desesperado ? "\nATENCIÓN: el rival está a punto de ganar (≥35 piedras). Acepta el mus si tu mano es mala para intentar mejorarla antes de apostar." : ""}
Responde JSON: {"quiereMus": true/false, "razon": "breve"}`);
      setEsperandoBot(false);
      quiere = resp ? resp.quiereMus : Math.random() > 0.35;
    }
if (quiere) {
      log(`Bot: Mus ✓`, "bot");
      setFase("descarte");
      log("Selecciona cartas a descartar y pulsa 'Descartar'", "sistema");
    } else {
      log(`Bot: No hay mus`, "bot");
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
    // Mazo único excluyendo cartas en juego
    const cartasEnJuego = [...manoJugador, ...manoBRef.current];
    const mazo = barajar(crearBaraja().filter(c =>
      !cartasEnJuego.some(j => j.palo === c.palo && j.valor === c.valor)
    ));
    let idxMazo = 0;
    const nuevasJ = manoJugador.map((c, i) =>
      cartasSeleccionadas.includes(i) ? mazo[idxMazo++] : c
    );
    log(`Tú: Descartas ${cartasSeleccionadas.length} carta(s)`, "jugador");
    setEsperandoBot(true);
    const manoB = manoBRef.current;
    let indices;
    if (modoDQNRef.current) {
      const selAcciones = [12, 13, 14, 15];
      const cartasSelBot = [];
      const legalDescarte = [12, 13, 14, 15, ACT_DESCARTAR];
      let pasos = 0;
      while (pasos < 10) {
        const accion = heuristicDecide({
          mano: manoB, fase: 'descarte', faseApuesta: 'grande',
          esMano: !esManoJRef.current,
          scoreSelf: ptBRef.current, scoreOpp: ptJRef.current,
          apuestaAbierta: null, cartasSeleccionadas: cartasSelBot,
        }, legalDescarte);
        if (accion === ACT_DESCARTAR) break;
        const idx = selAcciones.indexOf(accion);
        if (idx >= 0 && !cartasSelBot.includes(idx)) {
          cartasSelBot.push(idx);
        } else break;
        pasos++;
      }
      indices = cartasSelBot.length > 0 ? cartasSelBot : [
        // Garantizar al menos 1 descarte: la peor carta para grande
        manoB.map((c, i) => ({ i, r: c.valor === 12 || c.valor === 3 ? 8 : c.valor === 11 ? 7 : c.valor === 10 ? 6 : c.valor === 7 ? 5 : c.valor === 6 ? 4 : c.valor === 5 ? 3 : c.valor === 4 ? 2 : 1 }))
             .sort((a, b) => a.r - b.r)[0].i
      ];
      setEsperandoBot(false);
    } else {
      const resp = await consultarIA(`Tu mano (índices 0-3): ${manoATexto(manoB)}.
Para grande quieres cartas ALTAS (R/3>C>S>7>6>5>4>A/2). Para chica quieres cartas BAJAS (A/2<4<5<6<7<S<C<R/3). Para pares quieres repeticiones. Para juego quieres suma ≥31 pts.
¿Qué índices de carta descartarías? Considera qué lances tienes más opciones de ganar y optimiza para ellos.
Responde JSON: {"indicesToDescartar": [lista de índices 0-3 a descartar, puede ser vacía], "razon": "breve"}`);
      setEsperandoBot(false);
      indices = resp?.indicesToDescartar?.filter(i => i >= 0 && i < 4) || [];
    }
    // Bot usa el mismo mazo (continúa donde lo dejó el jugador)
    const nuevasB = manoB.map((c, i) =>
      indices.includes(i) ? mazo[idxMazo++] : c
    );
    log(`Bot: Descarta ${indices.length}`, "bot");
    setManoJugador(nuevasJ);
    setManoBot(nuevasB);
    setCartasSeleccionadas([]);
    setMusRechazado(false);
    setBotPidioMus(false);
    botMusDecididoRef.current = false;
    setFase("mus");
    log("¿Otra vez mus?", "sistema");
  };

  const noDescartar = () => {
    setCartasSeleccionadas([]);
    log("Tú: No descartas nada", "jugador");
    setBotPidioMus(false);
    botMusDecididoRef.current = false;
    setFase("mus");
  };

  // ── HELPERS DE APUESTA ───────────────────────────────────────────────────────
  const contextoApuesta = (tipo, manoB) => {
    const manoInfo = !esManoJRef.current
      ? "Eres el MANO (en empate, ganas)."
      : "Eres el POSTRE (el rival es mano; en empate, pierdes).";
    if (tipo === "grande") return `Grande (gana quien tenga cartas MÁS ALTAS carta a carta según escala R/3>C>S>7>6>5>4>A/2 — NO es suma de puntos). Tu mano de mayor a menor: ${manoOrdenadaGrande(manoB)}. Fuerza: ${fuerzaGrande(manoB)}. ${manoInfo}`;
    if (tipo === "chica") return `Chica (gana quien tenga cartas MÁS BAJAS carta a carta según escala A/2<4<5<6<7<S<C<R/3 — NO es suma de puntos). Tu mano de menor a mayor: ${manoOrdenadaChica(manoB)}. Fuerza: ${fuerzaChica(manoB)}. ${manoInfo}`;
    if (tipo === "pares") return `Pares. Tienes: ${tienePareja(manoB) || "sin pares"}. ${manoInfo}`;
    if (tipo === "juego") return `Juego. Tienes juego: ${tieneJuego(manoB)}. Puntos: ${puntosMano(manoB)}. ${manoInfo}`;
    if (tipo === "punto") return `Punto (más puntos gana, máximo 30). Tus puntos: ${puntosMano(manoB)}. ${manoInfo}`;
    return "";
  };

  // ── APUESTAS ─────────────────────────────────────────────────────────────────

  // Jugador pasa — bot responde (puede pasar o abrir)

  // Bot abre la apuesta cuando es mano (habla primero)
  const botAbreApuesta = useCallback(async () => {
    const tipo = faseApuestaRef.current;
    const manoB = manoBRef.current;
    setEsperandoBot(true);
    const resp = await botDecide(`Fase ${tipo}. ${contextoApuesta(tipo, manoB)}
Eres el MANO, hablas primero. Marcador: tú ${boteBRef.current + ptBRef.current}, rival ${boteJRef.current + ptJRef.current} piedras.
¿Abres la apuesta o pasas?
JSON: {"accion": "paso"|"envido", "cantidad": 2/4/999, "razon": "breve"}`, {
      manoJugador: manoB,
      fase: tipo, faseApuesta: tipo,
      esManoJugador: true,  // el bot ES mano
      puntosJugador: ptBRef.current, puntosBot: ptJRef.current,
      apuestaAbierta: null, declaracionBot: null,
    });
    setEsperandoBot(false);
    if (!resp || resp.accion === "paso") {
      log(`Bot: Paso${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      setBotPaso(true);
    } else {
      const c = resp.cantidad === 999 ? 999 : (resp.cantidad >= 4 ? 4 : 2);
      log(`Bot: ${c === 999 ? "Órdago" : `Envido (${c})`}${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      if (tipo === "grande") setGrandeApostado(true);
      if (tipo === "chica") setChicaApostado(true);
      setApuestaAbierta({ cantidad: c, quien: "bot" });
    }
  }, [botDecide, contextoApuesta]);

  // Cuando entra en fase apuesta y el bot es mano, el bot habla primero
  useEffect(() => {
    if (fase === "apuesta" && !apuestaAbierta && !esManoJugador) {
      botAbreApuesta();
    }
  }, [fase, faseApuesta]);

  const jugadorPasa = async () => {
    log("Tú: Paso", "jugador");
    if (botPaso) {
      setBotPaso(false);
      avanzarFase(faseApuestaRef.current);
      return;
    }
    setEsperandoBot(true);
    const tipo = faseApuestaRef.current;
    const manoB = manoBRef.current;
    const resp = await botDecide(`Fase ${tipo}. ${contextoApuesta(tipo, manoB)}
El rival ha pasado. Marcador: tú ${boteBRef.current + ptBRef.current}, rival ${boteJRef.current + ptJRef.current} piedras.
¿Abres la apuesta o también pasas?
JSON: {"accion": "paso"|"envido", "cantidad": 2/4/999, "razon": "breve"}`, {
      manoJugador: manoB,
      fase: tipo, faseApuesta: tipo,
      esManoJugador: !esManoJRef.current,
      puntosJugador: ptBRef.current, puntosBot: ptJRef.current,
      apuestaAbierta: null, declaracionBot: null,
    });
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
  // Helper: cobra el resultado de un "no quiero"
  // quien: quién cobra ('jugador' o 'bot') — el que envió el último envite
  // cantidadAceptada: piedras ya comprometidas (0 si no hay)
  const cobrarNoQuiero = useCallback((tipo, quien, cantidadAceptada) => {
    const setBoteCobrador = quien === 'jugador' ? setBoteJugador : setBoteBot;
    const emoji = quien === 'jugador' ? '✅ Tú ganas' : '❌ Bot gana';

    if (cantidadAceptada > 0) {
      // Había apuestas aceptadas → cobra las aceptadas (sin piedra de "porque no")
      if (tipo === 'pares') {
        setBoteCobrador(prev => prev + cantidadAceptada);
        log(`${emoji} ${cantidadAceptada} en pares (aceptadas). Puntos base se cuentan al final.`, quien === 'jugador' ? 'exito' : 'error');
        setApuestaExtraPares({ quien, extra: 0 });
      } else if (tipo === 'juego') {
        setBoteCobrador(prev => prev + cantidadAceptada);
        log(`${emoji} ${cantidadAceptada} en juego (aceptadas). Puntos base se cuentan al final.`, quien === 'jugador' ? 'exito' : 'error');
        setApuestaExtraJuego({ quien, extra: 0 });
      } else if (tipo === 'punto') {
        setBoteCobrador(prev => prev + cantidadAceptada);
        log(`${emoji} ${cantidadAceptada} en punto (aceptadas). Base se cuenta al final.`, quien === 'jugador' ? 'exito' : 'error');
        setApuestaExtraPunto({ quien, extra: 0 });
      } else {
        setBoteCobrador(prev => prev + cantidadAceptada);
        log(`${emoji} ${cantidadAceptada} en ${tipo} (apuestas aceptadas, sin porque no)`, quien === 'jugador' ? 'exito' : 'error');
        if (tipo === 'grande') grandeResultadoRef.current = { quien, pts: cantidadAceptada, cobrado: true };
        if (tipo === 'chica')  chicaResultadoRef.current  = { quien, pts: cantidadAceptada, cobrado: true };
      }
    } else {
      // Sin apuestas aceptadas → 1 piedra de "porque no"; puntos base al final
      if (tipo === 'pares') {
        setBoteCobrador(prev => prev + 1);
        log(`${emoji} 1 piedra (porque no) en pares. Puntos base se cuentan al final.`, quien === 'jugador' ? 'exito' : 'error');
        setApuestaExtraPares({ quien, extra: 0 });
      } else if (tipo === 'juego') {
        setBoteCobrador(prev => prev + 1);
        log(`${emoji} 1 piedra (porque no) en juego. Puntos base se cuentan al final.`, quien === 'jugador' ? 'exito' : 'error');
        setApuestaExtraJuego({ quien, extra: 0 });
      } else if (tipo === 'punto') {
        setBoteCobrador(prev => prev + 1);
        log(`${emoji} 1 piedra (porque no) en punto. Base se cuenta al final.`, quien === 'jugador' ? 'exito' : 'error');
        setApuestaExtraPunto({ quien, extra: 0 });
      } else {
        setBoteCobrador(prev => prev + 1);
        log(`${emoji} 1 piedra (porque no) en ${tipo}`, quien === 'jugador' ? 'exito' : 'error');
        if (tipo === 'grande') grandeResultadoRef.current = { quien, pts: 1, cobrado: true };
        if (tipo === 'chica')  chicaResultadoRef.current  = { quien, pts: 1, cobrado: true };
      }
    }
  }, [log]);

  const jugadorEnvido = async (cantidad) => {
    log(`Tú: ${cantidad === 999 ? "Órdago" : `Envido (${cantidad})`}`, "jugador");
    setEsperandoBot(true);
    const tipo = faseApuestaRef.current;
    if (tipo === "grande") setGrandeApostado(true);
    if (tipo === "chica") setChicaApostado(true);
    const manoB = manoBRef.current;
    const resp = await botDecide(`Fase ${tipo}. ${contextoApuesta(tipo, manoB)}
El rival ${cantidad === 999 ? "ha tirado un órdago" : `ha enviado ${cantidad} piedras`}. Marcador: tú ${boteBRef.current + ptBRef.current}, rival ${boteJRef.current + ptJRef.current} piedras.
IMPORTANTE: si no quieres, el rival solo gana 1 piedra ("porque no"), no las apostadas. Si quieres, se comparan manos y gana el mejor.
JSON: {"accion": "quiero"|"noquiero"|"subir", "cantidad": si subes pon el nuevo total, "razon": "breve"}`, {
      manoJugador: manoB,
      fase: tipo, faseApuesta: tipo,
      esManoJugador: !esManoJRef.current,
      puntosJugador: ptBRef.current, puntosBot: ptJRef.current,
      apuestaAbierta: { cantidad, cantidadAceptada: 0, quien: "jugador" }, declaracionBot: null,
    });
    setEsperandoBot(false);
    if (!resp || resp.accion === "quiero") {
      log(`Bot: Quiero${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      resolverApuesta(tipo, cantidad);
    } else if (resp.accion === "subir" && cantidad !== 999) {
      const nueva = Math.max((resp.cantidad || cantidad + 2), cantidad + 1);
      log(`Bot: Envido (${nueva})${resp.razon ? ` — ${resp.razon}` : ""}`, "bot");
      setApuestaAbierta({ cantidad: nueva, cantidadAceptada: cantidad, quien: "bot" });
    } else {
      log(`Bot: No quiero${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      cobrarNoQuiero(tipo, 'jugador', 0);
      setApuestaAbierta(null);
      setEstadoLances(prev => ({ ...prev, [tipo]: { tipo: 'no_querida', pts: 1, quien: 'jugador' } }));
      if (!comprobarVictoriaInmediata()) avanzarFase(tipo);
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
    const aceptadas = apuestaAbierta?.cantidadAceptada ?? 0;
    cobrarNoQuiero(tipo, 'bot', aceptadas);
    setApuestaAbierta(null);
    setEstadoLances(prev => ({ ...prev, [tipo]: { tipo: 'no_querida', pts: aceptadas || 1, quien: 'bot' } }));
    if (!comprobarVictoriaInmediata()) avanzarFase(tipo);
  };

  // Jugador sube la apuesta del bot
  const jugadorSube = async (nueva) => {
    log(`Tú: Envido (${nueva})`, "jugador");
    setEsperandoBot(true);
    const tipo = faseApuestaRef.current;
    const manoB = manoBRef.current;
    const cantidadAceptadaPorJugador = apuestaAbierta?.cantidad ?? 0;
    const resp = await botDecide(`Fase ${tipo}. ${contextoApuesta(tipo, manoB)}
El rival ha subido la apuesta a ${nueva} piedras (acepta tus ${cantidadAceptadaPorJugador} y añade más). Si no quieres, el rival cobra las ${cantidadAceptadaPorJugador} piedras aceptadas.
JSON: {"accion": "quiero"|"noquiero", "razon": "breve"}`, {
      manoJugador: manoB,
      fase: tipo, faseApuesta: tipo,
      esManoJugador: !esManoJRef.current,
      puntosJugador: ptBRef.current, puntosBot: ptJRef.current,
      apuestaAbierta: { cantidad: nueva, cantidadAceptada: cantidadAceptadaPorJugador, quien: "jugador" }, declaracionBot: null,
    });
    setEsperandoBot(false);
    if (!resp || resp.accion === "quiero") {
      log(`Bot: Quiero${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      resolverApuesta(tipo, nueva);
    } else {
      log(`Bot: No quiero${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
      cobrarNoQuiero(tipo, 'jugador', cantidadAceptadaPorJugador);
      setApuestaAbierta(null);
      setEstadoLances(prev => ({ ...prev, [tipo]: { tipo: 'no_querida', pts: cantidadAceptadaPorJugador || 1, quien: 'jugador' } }));
      if (!comprobarVictoriaInmediata()) avanzarFase(tipo);
    }
  };

  // ── RESOLVER COMPARACIÓN ────────────────────────────────────────────────────
  const resolverApuesta = (tipo, cantidad) => {
    const mJ = manoJRef.current, mB = manoBRef.current;
    let jugGana = false;
    if (tipo === "grande") {
      const cmp = compararManos(mJ, mB, "grande");
      jugGana = cmp > 0 || (cmp === 0 && esManoJRef.current);
    } else if (tipo === "chica") {
      const cmp = compararManos(mJ, mB, "chica");
      jugGana = cmp > 0 || (cmp === 0 && esManoJRef.current);
    } else if (tipo === "pares") {
      const vJ = valorPareja(mJ), vB = valorPareja(mB);
      jugGana = vJ > vB || (vJ === vB && esManoJRef.current);
    } else if (tipo === "juego") {
      const vJ = valorJuego(mJ), vB = valorJuego(mB);
      jugGana = vJ > vB || (vJ === vB && esManoJRef.current);
    } else if (tipo === "punto") {
      const vJ = puntosMano(mJ), vB = puntosMano(mB);
      jugGana = vJ > vB || (vJ === vB && esManoJRef.current);
    }
    const cant = cantidad === 999 ? 6 : cantidad;

    if (tipo === "grande" || tipo === "chica") {
      // Grande y chica: guardar resultado — se cobran al final con las cartas visibles
      if (tipo === "grande") {
        grandeResultadoRef.current = { quien: jugGana ? "jugador" : "bot", pts: cant, cobrado: false };
        log(`Grande: envite querido — ${cant} piedras en juego`, "sistema");
      } else {
        chicaResultadoRef.current = { quien: jugGana ? "jugador" : "bot", pts: cant, cobrado: false };
        log(`Chica: envite querido — ${cant} piedras en juego`, "sistema");
      }
    } else {
      // Pares, juego y punto: guardar apuesta extra; los puntos base se calculan al final
      const extra = { quien: jugGana ? "jugador" : "bot", extra: cant };
      if (tipo === "pares") {
        setApuestaExtraPares(extra);
        log(`Pares: envite querido — ${cant} piedras en juego`, "sistema");
      } else if (tipo === "juego") {
        setApuestaExtraJuego(extra);
        log(`Juego: envite querido — ${cant} piedras en juego`, "sistema");
      } else {
        setApuestaExtraPunto(extra);
        log(`Punto: envite querido — ${cant} piedras en juego`, "sistema");
      }
    }
    setApuestaAbierta(null);
    setEstadoLances(prev => ({ ...prev, [tipo]: { tipo: 'envidada', pts: cant, quien: null } }));
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
        _res.push({ lance: "Grande", quien: jugGana ? "jugador" : "bot", pts: 1, base: 1, apostado: 0, pqNo: 0 });
      } else {
        const r = grandeResultadoRef.current;
        if (r) {
          if (!r.cobrado) {
            if (r.quien === "jugador") { setBoteJugador(prev => prev + r.pts); log(`Grande: tú ganas ${r.pts} piedras`, "exito"); }
            else { setBoteBot(prev => prev + r.pts); log(`Grande: bot gana ${r.pts} piedras`, "error"); }
          }
          _res.push({ lance: "Grande", quien: r.quien, pts: r.pts, base: 0, apostado: r.cobrado ? 0 : r.pts, pqNo: r.cobrado ? 1 : 0 });
        }
      }
    }

    // ── Chica ──
    {
      const cmp = compararManos(mJ, mB, "chica");
      const jugGana = cmp > 0 || (cmp === 0 && esManoJRef.current);
      if (!chicaApostadoRef.current) {
        if (jugGana) { setBoteJugador(prev => prev + 1); log(`Chica (paso): tú ganas 1 punto`, "exito"); }
        else { setBoteBot(prev => prev + 1); log(`Chica (paso): bot gana 1 punto`, "error"); }
        _res.push({ lance: "Chica", quien: jugGana ? "jugador" : "bot", pts: 1, base: 1, apostado: 0, pqNo: 0 });
      } else {
        const r = chicaResultadoRef.current;
        if (r) {
          if (!r.cobrado) {
            if (r.quien === "jugador") { setBoteJugador(prev => prev + r.pts); log(`Chica: tú ganas ${r.pts} piedras`, "exito"); }
            else { setBoteBot(prev => prev + r.pts); log(`Chica: bot gana ${r.pts} piedras`, "error"); }
          }
          _res.push({ lance: "Chica", quien: r.quien, pts: r.pts, base: 0, apostado: r.cobrado ? 0 : r.pts, pqNo: r.cobrado ? 1 : 0 });
        }
      }
    }

    // ── Pares ──
    const jPares = tienePareja(mJ), bPares = tienePareja(mB);
    if (jPares || bPares) {
      if (apuestaExtraParesRef.current?.resuelto) {
        const r = apuestaExtraParesRef.current;
        _res.push({ lance: "Pares", quien: r.quien, pts: r.pts || 0, base: (r.pts || 1) - 1, apostado: 0, pqNo: 1 });
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
        _res.push({ lance: "Pares", quien: ganadorPares, pts: total, base: ptsBase, apostado: extra, pqNo: 0 });
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
        _res.push({ lance: "Punto", quien: r.quien, pts: r.pts || 2, base: 1, apostado: 0, pqNo: 1 });
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
        _res.push({ lance: "Punto", quien: ganadorPunto, pts: total, base: 1, apostado: extra, pqNo: 0 });
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
        _res.push({ lance: "Juego", quien: r.quien, pts: r.pts || 0, base: (r.pts || 1) - 1, apostado: 0, pqNo: 1 });
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
        _res.push({ lance: "Juego", quien: ganadorJuego, pts: total, base: ptsBase, apostado: extra, pqNo: 0 });
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
    setBotPaso(false);
    // Marcar el lance actual como "paso" si no tiene ya un estado
    setEstadoLances(prev => ({
      ...prev,
      [tipoActual]: prev[tipoActual] || { tipo: 'paso' }
    }));
    const orden = ["grande", "chica", "pares", "juego"];
    const idx = orden.indexOf(tipoActual);
    if (tipoActual === "punto" || idx >= orden.length - 1) {
      setTimeout(() => resolverPunto(), 400);
      return;
    }
    const siguiente = orden[idx + 1];
    setFaseApuesta(siguiente);

    if (siguiente === "pares") {
      setDeclaracionJugador(null);
      setDeclaracionBot(null);
      setFase("declarar_pares");
      log("── PARES: ¿Tienes pares? ──", "sistema");
      const manoB = manoBRef.current;
      const tienePB = tienePareja(manoB);
      if (!modoDQNRef.current) {
        setEsperandoBot(true);
        const resp = await consultarIA(`Tu mano: ${manoATexto(manoB)}.
Tienes que declarar si llevas pares. Tus pares: ${tienePB || "ninguno"}.
REGLA IMPORTANTE: en el mus la declaración es OBLIGATORIAMENTE honesta. Si tienes pares DEBES declarar que los tienes. Si no tienes, DEBES decir que no tienes. No se puede mentir.
JSON: {"declarar": ${tienePB !== null ? "true (tienes pares, debes declarar)" : "false (no tienes pares)"}, "razon": "breve"}`);
        setEsperandoBot(false);
        const declara = tienePB !== null;
        log(`Bot: ${declara ? "Tengo pares" : "No tengo pares"}${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
        setDeclaracionBot(declara ? "si" : "no");
      } else {
        const declara = tienePB !== null;
        log(`Bot: ${declara ? "Tengo pares" : "No tengo pares"}`, "bot");
        setDeclaracionBot(declara ? "si" : "no");
      }
      return;
    }

if (siguiente === "juego") {
      setDeclaracionJugador(null);
      setDeclaracionBot(null);
      setFase("declarar_juego");
      log("── JUEGO: ¿Tienes juego? ──", "sistema");
      const manoB = manoBRef.current;
      const tieneJB = tieneJuego(manoB);
      if (!modoDQNRef.current) {
        setEsperandoBot(true);
        const resp = await consultarIA(`Tu mano: ${manoATexto(manoB)}.
Tienes que declarar si llevas juego (31+ puntos). Tus puntos: ${puntosMano(manoB)}.
REGLA IMPORTANTE: la declaración es OBLIGATORIAMENTE honesta. Si tienes 31+ puntos DEBES declarar juego. Si no, DEBES decir que no tienes.
JSON: {"declarar": ${tieneJB ? "true (tienes juego, debes declarar)" : "false (no tienes juego)"}, "razon": "breve"}`);
        setEsperandoBot(false);
        const declara = tieneJB;
        log(`Bot: ${declara ? "Tengo juego" : "No tengo juego"}${resp?.razon ? ` — ${resp.razon}` : ""}`, "bot");
        setDeclaracionBot(declara ? "si" : "no");
      } else {
        const declara = tieneJB;
        log(`Bot: ${declara ? "Tengo juego" : "No tengo juego"}`, "bot");
        setDeclaracionBot(declara ? "si" : "no");
      }
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

  // Comprueba si alguien ha llegado a 40 con el bote actual
  // Se llama cada vez que se cobra un "porque no" durante la mano
  const comprobarVictoriaInmediata = useCallback((boteJExtra = 0, boteBExtra = 0) => {
    const nj = ptJRef.current + boteJRef.current + boteJExtra;
    const nb = ptBRef.current + boteBRef.current + boteBExtra;
    if (nj >= 40) {
      setPuntosJugador(nj);
      setPuntosBot(nb);
      setGanador("jugador");
      setFase("fin");
      log(`🏆 ¡Has llegado a ${nj} piedras! Partida terminada.`, "exito");
      return true;
    }
    if (nb >= 40) {
      setPuntosJugador(nj);
      setPuntosBot(nb);
      setGanador("bot");
      setFase("fin");
      log(`😔 El bot ha llegado a ${nb} piedras. Partida terminada.`, "error");
      return true;
    }
    return false;
  }, [log]);

  // ── FIN DE MANO ──────────────────────────────────────────────────────────────
  const terminarMano = () => {
    const bJ = boteJRef.current, bB = boteBRef.current;
    const nj = ptJRef.current + bJ, nb = ptBRef.current + bB;
    log(`Mano: +${bJ} para ti, +${bB} para el bot`, "sistema");
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
    fontFamily: "inherit", fontSize: 16, fontWeight: 700,
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
            <span style={{ fontSize: 14, color: "green" }}>El bot usa IA para razonar sus jugadas.</span>
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
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              onClick={() => setModoDQN(false)}
              style={{
                ...mkBtn(),
                fontSize: 13, padding: "8px 18px",
                opacity: modoDQN ? 0.45 : 1,
                border: modoDQN ? "1px solid #5a4030" : "2px solid #F6C90E",
              }}>
              🤖 Bot Claude
            </button>
            <button
              onClick={() => setModoDQN(true)}
              style={{
                ...mkBtn(),
                fontSize: 13, padding: "8px 18px",
                opacity: modoDQN ? 1 : 0.45,
                border: modoDQN ? "2px solid #F6C90E" : "1px solid #5a4030",
              }}>
              ⚡ Bot Heurística
            </button>
          </div>
          <p style={{ fontSize: 14, color: "redOrange", margin: 0 }}>
            {modoDQN ? "Bot Heurística: política calibrada, sin API, instantáneo" : "Bot Claude: IA con razonamiento en lenguaje natural"}
          </p>
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 900 }}>
        <p style={{ ...titulo, fontSize: "clamp(1.1rem,3.2vw,1.8rem)", flex: 1, margin: 0 }}>🂡 MUS</p>
        <div style={{ fontSize: 16, color: "#F6C90E99", fontWeight: 700, letterSpacing: "0.1em" }}>
          {etiquetaFase}
        </div>
        {[{ l: "TÚ", v: puntosJugador + boteJugador, c: "redOrange", esMano: esManoJugador },
          { l: "BOT", v: puntosBot + boteBot, c: "#e63946", esMano: !esManoJugador }].map(({ l, v, c, esMano }) => (
          <div key={l} style={{ ...panel, textAlign: "center", minWidth: 58, padding: "7px 12px", border: esMano ? "1px solid #a080c066" : panel.border }}>
            <div style={{ fontSize: 12, color: "redOrange" }}>{l}</div>
            {esMano && <div style={{ fontSize: 12, color: "#a080c0", fontWeight: 700, letterSpacing: "0.1em" }}>MANO</div>}
            <div style={{ fontSize: 21, fontWeight: 800, color: c, lineHeight: 1.1 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Layout: panel lances + tablero principal */}
      <div style={{ display: "flex", gap: 14, width: "100%", maxWidth: 900, alignItems: "flex-start" }}>

        {/* Panel de estado de lances */}
        <div style={{
          ...panel,
          minWidth: 140, maxWidth: 160,
          padding: "12px 10px",
          display: "flex", flexDirection: "column", gap: 6,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, color: "redOrange", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>LANCES</div>
          {["grande", "chica", "pares", "juego", "punto"].map(lance => {
            const e = estadoLances[lance];
            const faseActiva = ["declarar_pares", "pares"].includes(fase) && lance === "pares"
              || ["declarar_juego", "juego"].includes(fase) && lance === "juego"
              || fase === "apuesta" && faseApuesta === lance;
            let icono = "·";
            let color = "#4a3820";
            let texto = lance.charAt(0).toUpperCase() + lance.slice(1);
            let subtexto = null;
            if (faseActiva) {
              icono = "▶";
              color = "#F6C90E";
            } else if (e) {
              if (e.tipo === "paso") {
                icono = "—";
                color = "#6a7a90";
                subtexto = "paso";
              } else if (e.tipo === "envidada") {
                icono = "✓";
                color = e.quien === "jugador" ? "#2d9e60" : e.quien === "bot" ? "#e63946" : "#F6C90E";
                subtexto = e.quien ? `${e.pts} pts → ${e.quien === "jugador" ? "tú" : "bot"}` : `${e.pts} pts (en juego)`;
              } else if (e.tipo === "no_querida") {
                icono = "✗";
                color = e.quien === "jugador" ? "#2d9e60" : "#e63946";
                subtexto = `no querida (+1 → ${e.quien === "jugador" ? "tú" : "bot"})`;
              }
            }
            return (
              <div key={lance} style={{
                padding: "5px 7px", borderRadius: 6,
                background: faseActiva ? "rgba(246,201,14,0.08)" : "transparent",
                border: faseActiva ? "1px solid #F6C90E33" : "1px solid transparent",
              }}>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <span style={{ fontSize: 14, color, fontWeight: 700, minWidth: 10 }}>{icono}</span>
                  <span style={{ fontSize: 16, color: faseActiva ? "#F6C90E" : e ? color : "#5a4830", fontWeight: faseActiva ? 700 : 400 }}>{texto}</span>
                </div>
                {subtexto && (
                  <div style={{ fontSize: 14, color, marginLeft: 15, marginTop: 1 }}>{subtexto}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tablero principal */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

      {/* Mano bot */}
      <div style={{ ...panel, width: "100%" }}>
        <div style={{ fontSize: 11, color: "#7a6030", marginBottom: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <span>MANO DEL BOT{!esManoJugador && <span style={{ color: "#a080c0", fontWeight: 700, marginLeft: 8 }}>(mano)</span>}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {mostrarBotCartas && (
              <span style={{ color: "#e8a0a0" }}>
                {puntosMano(manoBot)} pts · {tienePareja(manoBot) || "sin pares"} · {tieneJuego(manoBot) ? `juego` : "sin juego"}
              </span>
            )}
            <button
              onClick={() => setMostrarBotCartas(prev => !prev)}
              style={{
                background: "transparent", border: "1px solid #5a4030",
                borderRadius: 4, color: "#8a7050", fontSize: 10,
                padding: "2px 7px", cursor: "pointer",
              }}>
              {mostrarBotCartas ? "🙈 ocultar" : "👁 ver"}
            </button>
          </div>
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
        ...panel, width: "100%",
        maxHeight: 120, overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 3
      }} ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
        {mensajes.length === 0 && <span style={{ color: "#4a3820", fontSize: 12 }}>—</span>}
        {mensajes.map(m => (
          <div key={m.id} style={{
            fontSize: 16, lineHeight: 1.4,
            color: {
              bot: "#e8a0a0", jugador: "#a0d8a0", sistema: "#F6C90Ecc",
              exito: "#80d8e8", error: "#e88080"
            }[m.tipo] || "#c0b090"
          }}>{m.msg}</div>
        ))}
      </div>

      {/* Mano jugador */}
      <div style={{ ...panel, width: "100%" }}>
        <div style={{ fontSize: 14, color: "#7a6030", marginBottom: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
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
        <div style={{ ...panel, width: "100%", border: "1px solid #F6C90E44" }}>
          <div style={{ fontSize: 14, color: "#F6C90Ecc", fontWeight: 700, letterSpacing: "0.12em", marginBottom: 10 }}>
            RESUMEN DE LA MANO
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {resumenMano.map(({ lance, quien, pts, base, apostado, pqNo }, idx) => {
              const partes = [];
              if (base > 0 && (apostado > 0 || pqNo || base > 1)) partes.push(`base ${base}`);
              if (apostado > 0) partes.push(`apostado ${apostado}`);
              if (pqNo) partes.push("porque no");
              const desglose = partes.length > 0 ? partes.join(" + ") : "en paso";
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16 }}>
                  <span style={{ color: "gold", minWidth: 52, flexShrink: 0 }}>{lance}</span>
                  <span style={{ fontWeight: 700, color: quien === "jugador" ? "#80d8a0" : "#e8a0a0" }}>
                    {quien === "jugador" ? "Tú" : "Bot"} +{pts}
                  </span>
                  <span style={{ fontSize: 13, color: "#b8900a" }}>({desglose})</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(180,140,60,0.15)", display: "flex", justifyContent: "space-between", fontSize: 16 }}>
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", width: "100%" }}>
        {esperandoBot && (
          <div style={{ ...panel, padding: "10px 20px", color: "#a08050", fontSize: 13, width: "100%", textAlign: "center" }}>
            ⏳ El bot está pensando...
          </div>
        )}

        {!esperandoBot && (<>
          {/* MUS */}
          {fase === "mus" && !musRechazado && !esperandoBot && (
            esManoJugador ? (<>
              <button style={mkBtn()} onClick={pedirMus}>Mus</button>
              <button style={mkBtn("#8090b0", true)} onClick={noHayMus}>No hay mus</button>
            </>) : botPidioMus ? (<>
              <button style={mkBtn()} onClick={() => {
                setBotPidioMus(false);
                log("Tú: Mus ✓", "jugador");
                setFase("descarte");
                log("Selecciona cartas a descartar y pulsa 'Descartar'", "sistema");
              }}>Mus ✓</button>
              <button style={mkBtn("#8090b0", true)} onClick={() => {
                setBotPidioMus(false);
                log("Tú: No hay mus", "jugador");
                setMusRechazado(true);
                setFaseApuesta("grande");
                setFase("apuesta");
                log("── GRANDE: ¿Paso o envido? ──", "sistema");
              }}>No hay mus</button>
            </>) : null
          )}

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

          {/* APUESTA — sin apuesta abierta: jugador habla si es mano, o si bot ya pasó */}
          {fase === "apuesta" && !apuestaAbierta && (esManoJugador || botPaso) && (<>
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

        </div> {/* fin tablero principal */}
      </div> {/* fin layout lances + tablero */}
    </div>
  );
}
