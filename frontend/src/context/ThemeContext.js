import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from 'react';
const ThemeContext = createContext({
    theme: 'dark',
    toggleTheme: () => { },
});
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('theme') ?? 'dark';
    });
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('light', theme === 'light');
        localStorage.setItem('theme', theme);
    }, [theme]);
    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
    return (_jsx(ThemeContext.Provider, { value: { theme, toggleTheme }, children: children }));
}
export const useTheme = () => useContext(ThemeContext);
