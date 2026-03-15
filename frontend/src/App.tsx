import { Router } from 'wouter'
import { WebSocketProvider } from '@/context/WebSocketContext'
import { WarRoom } from '@/components/layout/WarRoom'

export default function App() {
  return (
    <Router>
      <WebSocketProvider>
        <WarRoom />
      </WebSocketProvider>
    </Router>
  )
}
