import { Route, Router, Switch } from 'wouter'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { WebSocketProvider } from '@/context/WebSocketContext'
import { WarRoom } from '@/components/layout/WarRoom'
import { LoginPage } from '@/components/auth/LoginPage'
import { RegisterPage } from '@/components/auth/RegisterPage'
import { PrivacyPolicy } from '@/components/legal/PrivacyPolicy'
import { TermsOfService } from '@/components/legal/TermsOfService'

function AuthGate() {
  const { token } = useAuth()

  if (!token) {
    return (
      <Switch>
        <Route path="/register"  component={RegisterPage} />
        <Route path="/privacy"   component={PrivacyPolicy} />
        <Route path="/terms"     component={TermsOfService} />
        <Route component={LoginPage} />
      </Switch>
    )
  }

  return (
    <Switch>
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms"   component={TermsOfService} />
      <Route>
        <WebSocketProvider>
          <WarRoom />
        </WebSocketProvider>
      </Route>
    </Switch>
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
