import { Capacitor } from '@capacitor/core';

/** App instalado da Play Store / App Store (Capacitor). No navegador e no app de computador é false. */
export const isNativeApp = Capacitor.isNativePlatform();

/** Endereço público do sistema. No app de celular a página roda em https://localhost, que não serve para links externos. */
export const PUBLIC_ORIGIN = 'https://www.oxysrestaurante.app';
export const publicOrigin = () => (isNativeApp ? PUBLIC_ORIGIN : window.location.origin);

/** Ajustes do app de celular: barra de status, tela de abertura e botão voltar do Android. */
export async function setupNativeApp(goBack: () => void) {
  if (!isNativeApp) return;
  const [{ App }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/app'), import('@capacitor/splash-screen'), import('@capacitor/status-bar'),
  ]);
  // Ocupa a tela toda e respeita entalhe/barra de gestos (só no app; o site não muda).
  const viewport = document.querySelector('meta[name="viewport"]');
  viewport?.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
  document.documentElement.classList.add('native-app');
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {}); // texto claro: o sistema tem fundo escuro
  App.addListener('backButton', ({ canGoBack }) => {
    // Diálogos abertos fecham primeiro (o Radix escuta o Esc).
    if (document.querySelector('[role="dialog"][data-state="open"]')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } else if (canGoBack && window.history.length > 1) goBack();
    else App.minimizeApp();
  });
  SplashScreen.hide().catch(() => {});
}
