import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { DocxResult } from './DocxResult';
import { applySavedTheme } from '../announce/theme';

// Apply the popup's theme before the first paint, so nothing flashes or transitions.
applySavedTheme().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DocxResult />
    </StrictMode>,
  );
});
