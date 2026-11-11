import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { WhatsNew } from './WhatsNew';
import { applySavedTheme } from './theme';

applySavedTheme().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <WhatsNew />
    </StrictMode>,
  );
});
