import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentApp } from './AgentApp';
import '../index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(
  <StrictMode>
    <AgentApp />
  </StrictMode>,
);
