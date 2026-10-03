/** Recursos do app Oxys para Windows/Mac/Linux (pasta desktop/). No navegador comum, `desktop` é null. */
export type DesktopPrinter = { name: string; displayName: string; isDefault: boolean };

type OxysDesktop = {
  info: () => Promise<{ version: string; platform: string; autoStart: boolean }>;
  setAutoStart: (enabled: boolean) => Promise<boolean>;
  listPrinters: () => Promise<DesktopPrinter[]>;
  printHtml: (html: string, options?: { deviceName?: string }) => Promise<void>;
  // central do modo offline (versões novas do app)
  hubStatus?: () => Promise<HubStatus>;
  hubActivate?: (p: { key: string; restaurantId: string; functionsUrl: string; apikey: string; pin: string }) => Promise<HubStatus>;
  hubDeactivate?: () => Promise<HubStatus>;
  hubSetDevices?: (devices: Record<string, string>) => Promise<boolean>;
  hubSync?: () => Promise<HubStatus>;
};

export type HubStatus = {
  enabled: boolean; online?: boolean; port?: number; lanUrls?: string[]; restaurantId?: string | null;
  lastSyncAt?: string | null; snapshotAt?: string | null; pendingOps?: number; failedOps?: number; error?: string | null;
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
  linux: `${RELEASES}/Oxys-Restaurante-Linux.deb`,
};

/** Instaladores do "Oxys Servidor" (servidor dedicado da loja, recurso contratado). */
export const SERVER_DOWNLOADS = {
  windows: `${RELEASES}/Oxys-Servidor-Setup.exe`,
  linux: `${RELEASES}/Oxys-Servidor-Linux.deb`,
  linuxAppImage: `${RELEASES}/Oxys-Servidor-Linux.AppImage`,
  mac: `${RELEASES}/Oxys-Servidor-Mac.dmg`,
};
