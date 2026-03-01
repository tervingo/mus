# 🂡 Mus

Juego de mus con IA (Claude) como oponente.

## Instalación

```bash
npm install
```

## Configuración

Abre `proxy.js` y pon tu API key de Anthropic en la línea:

```js
const ANTHROPIC_API_KEY = 'sk-ant-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
```

Puedes obtener una en https://console.anthropic.com/

## Arrancar

```bash
npm run dev
```

Esto lanza simultáneamente:
- **Vite** (frontend React) en http://localhost:5173
- **Proxy** (reenvío a Anthropic) en http://localhost:3001

Abre http://localhost:5173 en el navegador y a jugar.
