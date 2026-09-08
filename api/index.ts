import express from 'express'

const app = express()
const port = 3001

app.get('/api/hello', (_request, response) => {
  response.json({ message: 'Hello world!' })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`API listening on http://localhost:${port}`)
})
