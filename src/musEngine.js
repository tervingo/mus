// ── CONSTANTES ────────────────────────────────────────────────────────────────
export const PALOS = ["oros", "copas", "espadas", "bastos"];
export const VALORES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
export const NOMBRES_VALOR = { 1: "As", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 10: "Sota", 11: "Caballo", 12: "Rey" };
export const PALO_EMOJI = { oros: "🟡", copas: "🔴", espadas: "⚔️", bastos: "🪵" };
export const PALO_COLOR = { oros: "#F6C90E", copas: "#E63946", espadas: "#5B9BD5", bastos: "#5A9E52" };

// ── BARAJA ────────────────────────────────────────────────────────────────────
export function crearBaraja() {
  const b = [];
  for (const p of PALOS) for (const v of VALORES) b.push({ palo: p, valor: v });
  return b;
}
export function barajar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function repartir() {
  const b = barajar(crearBaraja());
  return { jugador: b.slice(0, 4), bot: b.slice(4, 8) };
}

// ── PUNTOS Y EQUIVALENCIAS ────────────────────────────────────────────────────
// En el mus: 3 equivale a Rey (valor 10 en grande/chica, y cuenta como Rey en pares)
//            2 equivale a As (valor 1 en grande/chica, y cuenta como As en pares)
export function puntosValor(v) {
  if (v === 3) return 10;       // 3 = Rey a efectos de puntos
  if (v === 2) return 1;        // 2 = As a efectos de puntos (ya vale 1, pero explícito)
  if (v >= 10) return 10;       // Sota, Caballo, Rey
  return v;
}
export function valorPares(v) {
  if (v === 3 || v === 12) return 12;  // 3 y Rey son equivalentes
  if (v === 2 || v === 1) return 1;    // 2 y As son equivalentes
  return v;
}
export function puntosMano(mano) { return mano.reduce((s, c) => s + puntosValor(c.valor), 0); }
export function tieneJuego(mano) { return puntosMano(mano) >= 31; }

// 31 real: exactamente tres 7s y una Sota (7+7+7+10=31)
export function es31Real(mano) {
  const sietes = mano.filter(c => c.valor === 7).length;
  const sotas = mano.filter(c => c.valor === 10).length;
  return sietes === 3 && sotas === 1;
}

export function valorJuego(mano) {
  const p = puntosMano(mano);
  if (!tieneJuego(mano)) return 0;
  if (es31Real(mano)) return 10000;  // 31 real gana a todo
  if (p === 31) return 9999;
  if (p === 32) return 9998;
  return p;
}

// ── RANKING GRANDE / CHICA ────────────────────────────────────────────────────
// Orden de cartas para grande y chica
// R(12)/3 y A(1)/2 son equivalentes entre sí
export function rangoGrande(v) {
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
export function rangoChica(v) {
  // Mayor rango = peor para chica (queremos los menores)
  return rangoGrande(v); // mismo orden, pero comparamos al revés
}

// Compara dos manos carta a carta para grande (desc) o chica (asc)
// Devuelve 1 si manoA gana, -1 si manoB gana, 0 si empate (gana mano = jugador)
export function compararManos(manoA, manoB, tipo) {
  const rankFn = tipo === "grande" ? rangoGrande : rangoChica;
  const sortDir = tipo === "grande" ? 1 : -1; // grande: desc (mayor primero), chica: asc (menor primero)
  const sortedA = [...manoA].sort((a, b) => sortDir * (rankFn(b.valor) - rankFn(a.valor)));
  const sortedB = [...manoB].sort((a, b) => sortDir * (rankFn(b.valor) - rankFn(a.valor)));
  for (let i = 0; i < 4; i++) {
    const rA = rankFn(sortedA[i].valor);
    const rB = rankFn(sortedB[i].valor);
    if (rA !== rB) return tipo === "grande" ? (rA > rB ? 1 : -1) : (rA < rB ? 1 : -1);
  }
  return 0; // empate → gana mano (jugador)
}

// ── PARES ─────────────────────────────────────────────────────────────────────
export function tienePareja(mano) {
  const g = {};
  for (const c of mano) { const k = valorPares(c.valor); g[k] = (g[k] || 0) + 1; }
  const counts = Object.values(g).sort((a, b) => b - a);
  if (counts[0] >= 4) return "duples";                              // RRRR = duples (pareja doble)
  if (counts[0] >= 3) return "medias";                              // 3 iguales = medias (2 pts)
  if (counts[0] >= 2 && (counts[1] || 0) >= 2) return "duples";   // 2 parejas distintas = duples (3 pts)
  if (counts[0] >= 2) return "pareja";                              // 1 pareja (1 pt)
  return null;
}
export function valorPareja(mano) {
  const g = {};
  for (const c of mano) { const k = valorPares(c.valor); g[k] = (g[k] || 0) + 1; }
  const orden = { duples: 3, medias: 2, pareja: 1 };
  const tipo = tienePareja(mano);
  if (!tipo) return 0;
  const entries = Object.entries(g).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  return orden[tipo] * 1000 + parseInt(entries[0][0]);
}

// ── TEXTO Y FUERZA ────────────────────────────────────────────────────────────
export function manoATexto(mano) {
  return mano.map(c => `${NOMBRES_VALOR[c.valor]} de ${c.palo}`).join(", ");
}
// Devuelve la mano ordenada para grande (desc) o chica (asc) como texto
export function manoOrdenadaGrande(mano) {
  return [...mano]
    .sort((a, b) => rangoGrande(b.valor) - rangoGrande(a.valor))
    .map(c => NOMBRES_VALOR[c.valor]).join(" > ");
}
export function manoOrdenadaChica(mano) {
  return [...mano]
    .sort((a, b) => rangoGrande(a.valor) - rangoGrande(b.valor))
    .map(c => NOMBRES_VALOR[c.valor]).join(" < ");
}
// Fuerza relativa de la mano (0-100) para grande y chica
export function fuerzaGrande(mano) {
  const r = [...mano].sort((a, b) => rangoGrande(b.valor) - rangoGrande(a.valor))
    .map(c => rangoGrande(c.valor));
  const score = r[0]*512 + r[1]*64 + r[2]*8 + r[3]; // max=4680, min=585
  const pct = Math.round((score - 585) / (4680 - 585) * 100);
  if (pct >= 80) return "muy fuerte";
  if (pct >= 55) return "fuerte";
  if (pct >= 35) return "media";
  return "muy débil";
}
export function fuerzaChica(mano) {
  const r = [...mano].sort((a, b) => rangoGrande(a.valor) - rangoGrande(b.valor))
    .map(c => rangoGrande(c.valor));
  const score = r[0]*512 + r[1]*64 + r[2]*8 + r[3]; // menor = mejor para chica
  const pct = Math.round((4680 - score) / (4680 - 585) * 100);
  if (pct >= 80) return "muy fuerte";
  if (pct >= 55) return "fuerte";
  if (pct >= 35) return "media";
  if (pct >= 15) return "débil";
  return "muy débil";
}

// ── PUNTOS BASE SIN OPONENTE ──────────────────────────────────────────────────
export function puntosParesSinOponente(mano) {
  const tipo = tienePareja(mano);
  if (tipo === "pareja") return 1;
  if (tipo === "medias") return 2;   // 3 iguales
  if (tipo === "duples") return 3;   // 2 parejas (distintas o iguales)
  return 0;
}
export function puntosJuegoSinOponente(mano) {
  if (!tieneJuego(mano)) return 0;
  return puntosMano(mano) === 31 ? 3 : 2;
}
