import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Route, Router, Switch } from 'wouter';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { TimezoneProvider } from '@/context/TimezoneContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { WarRoom } from '@/components/layout/WarRoom';
import { LoginPage } from '@/components/auth/LoginPage';
import { RegisterPage } from '@/components/auth/RegisterPage';
import { PrivacyPolicy } from '@/components/legal/PrivacyPolicy';
import { TermsOfService } from '@/components/legal/TermsOfService';
function AuthGate() {
    const { token } = useAuth();
    if (!token) {
        return (_jsxs(Switch, { children: [_jsx(Route, { path: "/register", component: RegisterPage }), _jsx(Route, { path: "/privacy", component: PrivacyPolicy }), _jsx(Route, { path: "/terms", component: TermsOfService }), _jsx(Route, { component: LoginPage })] }));
    }
    return (_jsxs(Switch, { children: [_jsx(Route, { path: "/privacy", component: PrivacyPolicy }), _jsx(Route, { path: "/terms", component: TermsOfService }), _jsx(Route, { children: _jsx(WebSocketProvider, { children: _jsx(WarRoom, {}) }) })] }));
}
export default function App() {
    return (_jsx(Router, { children: _jsx(ThemeProvider, { children: _jsx(AuthProvider, { children: _jsx(TimezoneProvider, { children: _jsx(AuthGate, {}) }) }) }) }));
}
