import { Route, Router, Switch } from 'wouter'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { WebSocketProvider } from '@/context/WebSocketContext'
import { WarRoom } from '@/components/layout/WarRoom'
import { LoginPage } from '@/components/auth/LoginPage'
import { RegisterPage } from '@/components/auth/RegisterPage'

function AuthGate() {
  const { token } = useAuth()

  if (!token) {
    return (
      <Switch>
        <Route path="/register" component={RegisterPage} />
        <Route component={LoginPage} />
      </Switch>
    )
  }

  return (
    <WebSocketProvider>
      <WarRoom />
    </WebSocketProvider>
  )
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </Router>
  )
}
