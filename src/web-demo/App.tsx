import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import AddonTrzsz from './trzsz/addon.js'

const App: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const terminal = useRef<Terminal | null>(null)
  const ws = useRef<WebSocket | null>(null)
  const trzszAddon = useRef<AddonTrzsz | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    if (terminalRef.current == null) return

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#1e1e1e'
      }
    })
    terminal.current = term

    term.loadAddon(new WebLinksAddon())

    const addon = new AddonTrzsz()
    trzszAddon.current = addon

    // Set up log callback to display logs in the bottom div
    addon.setOnLog((message) => {
      const timestamp = new Date().toLocaleTimeString()
      setLogs(prev => [...prev, `[${timestamp}] ${message}`])
    })

    term.loadAddon(addon as any)

    term.open(terminalRef.current)

    // Connect to WebSocket server
    const websocket = new WebSocket('ws://localhost:8081/terminal')
    ws.current = websocket

    websocket.binaryType = 'arraybuffer'

    websocket.onopen = () => {
      console.log('WebSocket connected')
      term.writeln('Connected to server (Trzsz Client)')
    }

    websocket.onmessage = (event) => {
      // Pass all data to addon for trzsz protocol detection
      addon.consume(event.data)
    }

    websocket.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason)
      term.writeln(`\r\nConnection closed: ${event.code} ${event.reason}`)
    }

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
      term.writeln('\r\nWebSocket error occurred')
    }

    term.onData((data) => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(data)
      }
    })

    addon.trzszAttach({
      socket: websocket,
      term,
      onDetect: (type) => {
        console.log('[App] onDetect called with type:', type)
        if (type === 'send') {
          console.log('[App] Calling handleSendFile')
          handleSendFile(addon)
        }
      }
    })

    return () => {
      websocket.close()
      term.dispose()
    }
  }, [])

  const handleSendFile = async (addon: AddonTrzsz) => {
    console.log('[App] handleSendFile called')
    try {
      // Always use hidden input for file selection
      // Note: showOpenFilePicker requires user gesture, but onDetect is triggered
      // by WebSocket message, not user action, so we use the fallback method
      console.log('[App] Creating file input element')
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.style.display = 'none'
      input.onchange = (e) => {
        console.log('[App] File input onchange triggered')
        const files = (e.target as HTMLInputElement).files
        if ((files != null) && files.length > 0) {
          console.log('[App] Files selected:', files.length)
          addon.sendFiles(Array.from(files))
        }
      }
      document.body.appendChild(input)
      console.log('[App] Input appended to body, about to click')
      // Use setTimeout to ensure the input is in the DOM before clicking
      setTimeout(() => {
        console.log('[App] Calling input.click()')
        input.click()
        // Remove after a delay to allow the file dialog to open
        setTimeout(() => {
          console.log('[App] Removing input from DOM')
          document.body.removeChild(input)
        }, 100)
      }, 0)
    } catch (e) {
      console.error('[App] File selection failed', e)
      terminal.current?.writeln('\r\nFile selection cancelled or failed.')
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#1e1e1e', display: 'flex', flexDirection: 'column' }}>
      <div ref={terminalRef} style={{ flex: 1, minHeight: 0 }} />
      <div
        style={{
          height: '200px',
          backgroundColor: '#0d0d0d',
          borderTop: '1px solid #333',
          overflow: 'auto',
          padding: '8px',
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: '12px',
          color: '#ccc'
        }}
      >
        <div style={{ marginBottom: '4px', color: '#888' }}>--- Transfer Logs ---</div>
        {logs.map((log, index) => (
          <div key={index} style={{ marginBottom: '2px' }}>{log}</div>
        ))}
      </div>
    </div>
  )
}

export default App
