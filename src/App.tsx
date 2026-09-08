import { useEffect } from 'react'

function App() {
  useEffect(() => {
    let timeoutId: number | undefined

    const callHelloApi = () => {
      timeoutId = window.setTimeout(async () => {
        try {
          const response = await fetch('/api/hello')

          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`)
          }

          const data: { message: string } = await response.json()
          console.log(data.message)
        } catch (error) {
          console.error('Could not call the hello API:', error)
        }
      }, 1000)
    }

    if (document.readyState === 'complete') {
      callHelloApi()
    } else {
      window.addEventListener('load', callHelloApi, { once: true })
    }

    return () => {
      window.removeEventListener('load', callHelloApi)
      window.clearTimeout(timeoutId)
    }
  }, [])

  return (
    <main>
      <h1>Meet People</h1>
      <p>React is ready.</p>
    </main>
  )
}

export default App
