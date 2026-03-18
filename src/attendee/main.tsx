import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import AttendeeApp from '../AttendeeApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AttendeeApp />
  </StrictMode>,
)
