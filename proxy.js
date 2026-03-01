// proxy.js — Reenvía llamadas al API de Anthropic con tu API key
// Necesario para evitar el bloqueo CORS del navegador

import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

app.post('/api/claude', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    })
    const data = await response.json()
    res.json(data)
  } catch (err) {
    console.error('Error proxy:', err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(3001, () => {
  console.log('🂡 Proxy Mus escuchando en http://localhost:3001')
})
