import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './ThemeContext'
import { AuthProvider } from './AuthContext'
import { AvatarThemeSync } from './components/AvatarThemeSync'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AvatarThemeSync />
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
