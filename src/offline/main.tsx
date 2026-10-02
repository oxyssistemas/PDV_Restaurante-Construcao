import { createRoot } from 'react-dom/client';
import OfflineApp from './OfflineApp';
import '../index.css';

// Modo offline: servido pela central (app de computador do caixa) na rede da loja.
createRoot(document.getElementById('root')!).render(<OfflineApp />);
