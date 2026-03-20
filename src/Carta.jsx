import { NOMBRES_VALOR, PALO_EMOJI, PALO_COLOR } from './musEngine.js';

// Las imágenes deben estar en public/cartas/{valor}_{palo}.png
// Ejemplo: public/cartas/1_oros.png, public/cartas/12_bastos.png, etc.
const USAR_IMAGENES = true;

export default function Carta({ carta, oculta = false, seleccionada = false, onClick = null }) {
  if (oculta) {
    return (
      <div style={{
        width: 100, height: 144, borderRadius: 10, flexShrink: 0,
        background: "repeating-linear-gradient(45deg,#0f2744 0px,#0f2744 5px,#0d1f38 5px,#0d1f38 10px)",
        border: "2px solid #1e4a7a",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
      }}>🂠</div>
    );
  }
  const color = PALO_COLOR[carta.palo];
  const wrapStyle = {
    width: 100, height: 144, borderRadius: 10, flexShrink: 0,
    border: seleccionada ? `3px solid ${color}` : "2px solid #c8b89a",
    cursor: onClick ? "pointer" : "default",
    transition: "all 0.15s ease",
    transform: seleccionada ? "translateY(-12px) scale(1.05)" : "none",
    boxShadow: seleccionada ? `0 10px 28px ${color}55` : "0 3px 10px rgba(0,0,0,0.25)",
    userSelect: "none", overflow: "hidden"
  };

  if (USAR_IMAGENES) {
    return (
      <div onClick={onClick} style={wrapStyle}>
        <img
          src={`/cartas/${carta.valor}_${carta.palo}.png`}
          alt={`${NOMBRES_VALOR[carta.valor]} de ${carta.palo}`}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    );
  }

  return (
    <div onClick={onClick} style={{
      ...wrapStyle,
      background: seleccionada ? `linear-gradient(160deg,${color}22,${color}44)` : "linear-gradient(160deg,#fff,#f2ede0)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "space-between", padding: "5px 3px",
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
