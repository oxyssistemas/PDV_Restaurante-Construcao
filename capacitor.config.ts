import type { CapacitorConfig } from '@capacitor/cli';

// App de celular/tablet (Android e iOS). Leva o sistema compilado (pasta dist) dentro do app:
// rode "npm run build" e "npx cap sync" antes de abrir no Android Studio / Xcode.
const config: CapacitorConfig = {
  appId: 'app.oxysrestaurante',
  appName: 'Oxys Restaurante',
  webDir: 'dist',
  backgroundColor: '#0f1729',
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#0f1729', showSpinner: false },
    StatusBar: { overlaysWebView: false },
  },
  android: { allowMixedContent: false },
  ios: { contentInset: 'never' },
};

export default config;
