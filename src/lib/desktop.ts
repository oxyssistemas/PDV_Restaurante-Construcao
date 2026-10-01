/** Recursos do app Oxys para Windows/Mac (pasta desktop/). No navegador comum, `desktop` é null. */
export type DesktopPrinter = { name: string; displayName: string; isDefault: boolean };

type OxysDesktop = {
  info: () => Promise<{ version: string; platform: string; autoStart: boolean }>;
  setAutoStart: (enabled: boolean) => Promise<boolean>;
  listPrinters: () => Promise<DesktopPrinter[]>;
  printHtml: (html: string, options?: { deviceName?: string }) => Promise<void>;
};

declare global {
  interface Window { oxysDesktop?: OxysDesktop }
}

export const desktop: OxysDesktop | null = typeof window !== 'undefined' ? window.oxysDesktop ?? null : null;
export const isDesktopApp = !!desktop;

const RELEASES = 'https://github.com/oxyssistemas/PDV_Restaurante-Construcao/releases/latest/download';
export const DESKTOP_DOWNLOADS = {
  windows: `${RELEASES}/Oxys-Restaurante-Setup.exe`,
  mac: `${RELEASES}/Oxys-Restaurante-Mac.dmg`,
};
