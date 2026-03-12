import { WebSocketProvider } from '@/context/WebSocketContext'
import { WarRoom } from '@/components/layout/WarRoom'

export default function App() {
  return (
    <WebSocketProvider>
      <WarRoom />
    </WebSocketProvider>
  )
}
