/** Tema claro/escuro escolhido pela pessoa (fica neste aparelho). */
export type ThemeMode = 'dark' | 'light';

const KEY = 'oxys-theme';

export function storedTheme(): ThemeMode {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function storeTheme(mode: ThemeMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* navegador sem armazenamento */ }
}

/** Aplica o tema no <html> (classes usadas pelos tokens de cor em index.css). */
export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  root.style.colorScheme = mode;
}
