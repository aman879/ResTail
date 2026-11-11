import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { DocxResult } from './DocxResult';

// Apply the popup's theme before the first paint, so nothing flashes or transitions.
chrome.storage.local.get('darkMode').then(({ darkMode }) => {
  document.documentElement.classList.toggle('dark', darkMode === true);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DocxResult />
    </StrictMode>,
  );
});
