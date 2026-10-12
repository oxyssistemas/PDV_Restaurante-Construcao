/**
 * Balança na porta serial/USB (Toledo Prix, Filizola, Urano e similares) pelo Web Serial do Chrome/app de computador.
 * Pede o peso (ENQ) e lê o que a balança manda: "00.452", "0,452 kg" ou "00452" (gramas).
 */
type SerialPortLike = {
  open(o: { baudRate: number }): Promise<void>; close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null;
};
type SerialLike = { getPorts(): Promise<SerialPortLike[]>; requestPort(): Promise<SerialPortLike> };

const serial = () => (navigator as unknown as { serial?: SerialLike }).serial;
export const scaleSupported = () => !!serial();

const BAUD_KEY = 'oxys-scale-baud';
export const scaleBaud = () => { try { return Number(localStorage.getItem(BAUD_KEY)) || 9600; } catch { return 9600; } };
export const setScaleBaud = (b: number) => { try { localStorage.setItem(BAUD_KEY, String(b)); } catch { /* sem armazenamento */ } };

/** Peso em kg a partir do texto que a balança mandou (ou null). */
export function parseScale(text: string): number | null {
  const clean = text.replace(/[^\d.,]/g, ' ');
  const dec = clean.match(/\d+[.,]\d{1,3}/g);
  if (dec?.length) return Number(dec[dec.length - 1].replace(',', '.')) || null;
  const raw = clean.match(/\d{4,6}/g);
  if (raw?.length) return Number(raw[raw.length - 1]) / 1000 || null; // gramas
  return null;
}

/** Lê um peso (kg). Na primeira vez o navegador pergunta qual porta usar. */
export async function readScale(timeoutMs = 2500): Promise<number> {
  const s = serial();
  if (!s) throw new Error('Este navegador não acessa a balança. Use o app de computador ou o Chrome.');
  const port = (await s.getPorts())[0] ?? await s.requestPort();
  await port.open({ baudRate: scaleBaud() });
  try {
    const w = port.writable?.getWriter();
    if (w) { await w.write(new Uint8Array([0x05])); w.releaseLock(); } // ENQ: pede o peso (protocolo Toledo)
    const reader = port.readable!.getReader();
    let text = '';
    const stop = window.setTimeout(() => { reader.cancel().catch(() => undefined); }, timeoutMs);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
        const kg = parseScale(text);
        if (kg && /[\x03\r\n]/.test(text)) return kg;
      }
    } finally {
      window.clearTimeout(stop);
      reader.releaseLock();
    }
    const kg = parseScale(text);
    if (!kg) throw new Error('A balança não mandou o peso. Confira o cabo e se o prato está estável.');
    return kg;
  } finally {
    await port.close().catch(() => undefined);
  }
}
