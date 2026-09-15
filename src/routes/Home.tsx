import { useState } from 'react'
import { HelloResponseSchema } from '../../shared/schemas'

function Home() {
  const [apiStatus, setApiStatus] = useState('API not checked.')

  async function checkApi() {
    setApiStatus('Checking API...')

    try {
      const response = await fetch('/api/hello')
      const result = HelloResponseSchema.safeParse(await response.json())

      if (!response.ok || !result.success) {
        throw new Error('The API returned an invalid response.')
      }

      setApiStatus(result.data.message)
    } catch {
      setApiStatus('API unavailable.')
    }
  }

  return (
    <main className="space-y-4">
      <h1>Meet People</h1>
      <p>React is ready.</p>
      <button type="button" onClick={() => void checkApi()}>Check API</button>
      <p role="status">{apiStatus}</p>
    </main>
  )
}

export default Home
