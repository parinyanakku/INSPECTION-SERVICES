import { createRoot } from 'react-dom/client';
import AccountWorkspace from './components/AccountWorkspace';
import './index.css';

// Filter transient Vite/iframe WebSocket rejections on Cloud Run preview
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message =
    typeof reason === 'string'
      ? reason
      : reason && typeof reason === 'object' && 'message' in reason
      ? String((reason as { message?: unknown }).message ?? '')
      : '';
  if (
    message.includes('WebSocket closed without opened') ||
    message.includes('failed to connect to websocket')
  ) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(<AccountWorkspace />);
