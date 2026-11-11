/** Applies the popup's saved light/dark choice to an extension page before it renders. */
export async function applySavedTheme(): Promise<void> {
  const { darkMode } = await chrome.storage.local.get('darkMode');
  document.documentElement.classList.toggle('dark', darkMode === true);
}
