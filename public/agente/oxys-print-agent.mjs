#!/usr/bin/env node
// Oxys Restaurante — Agente de impressão
// Busca os cupons do restaurante no servidor e envia direto para as impressoras térmicas
// (rede ou USB), sem janela de impressão. Requer Node.js 18 ou mais novo.
//
// Primeira vez:   node oxys-print-agent.mjs SUA_CHAVE
// Depois:         node oxys-print-agent.mjs
//
// A chave é gerada em Configurações → Impressoras → Agente local.

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir, hostname, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '1.0.0';
const DEFAULT_URL = 'https://ocaruinsqobxbzcnrsiy.supabase.co/functions/v1/print-agent';
const POLL_MS = 3000;
const here = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(here, 'oxys-agente.json');

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

// ---------- configuração ----------
let config = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : {};
if (process.argv[2]) {
  config = { ...config, key: process.argv[2].trim() };
  writeFileSync(CONFIG, JSON.stringify(config, null, 2));
  log('Chave salva em', CONFIG);
}
if (!config.key) {
  console.error('Informe a chave do agente: node oxys-print-agent.mjs SUA_CHAVE');
  process.exit(1);
}
const URL_ = config.url || DEFAULT_URL;

// ---------- envio para a impressora ----------
const isIp = a => /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(a);

function sendTcp(address, data) {
  const [host, port] = address.split(':');
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port: Number(port || 9100) }, () => socket.end(data));
    socket.setTimeout(10000, () => socket.destroy(new Error(`Sem resposta da impressora ${address}`)));
    socket.on('error', e => reject(new Error(`Impressora ${address}: ${e.message}`)));
    socket.on('close', hadError => { if (!hadError) resolve(); });
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(err.trim() || `${cmd} saiu com código ${code}`))));
  });
}

// Windows: envia bytes "crus" para a impressora instalada (driver Generic/Text Only ou o do fabricante).
const WIN_RAW = `
param([string]$Printer, [string]$File)
$code = @"
using System; using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr h, int l, DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
  public static void Send(string printer, byte[] data) {
    IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Impressora nao encontrada: " + printer);
    var di = new DOCINFO { pDocName = "Oxys", pDataType = "RAW" };
    try { StartDocPrinter(h, 1, di); StartPagePrinter(h); int w; WritePrinter(h, data, data.Length, out w); EndPagePrinter(h); EndDocPrinter(h); }
    finally { ClosePrinter(h); }
  }
}
"@
Add-Type -TypeDefinition $code
[RawPrinter]::Send($Printer, [System.IO.File]::ReadAllBytes($File))
`;

async function sendLocal(address, data) {
  const dir = mkdtempSync(join(tmpdir(), 'oxys-'));
  const file = join(dir, 'cupom.bin');
  writeFileSync(file, data);
  try {
    if (address.startsWith('/dev/')) { writeFileSync(address, data); return; }
    if (platform() === 'win32') {
      const ps1 = join(dir, 'raw.ps1');
      writeFileSync(ps1, WIN_RAW);
      await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Printer', address, '-File', file]);
    } else {
      await run('lp', ['-d', address, '-o', 'raw', file]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const print = (address, data) => (isIp(address) ? sendTcp(address, data) : sendLocal(address, data));

// ---------- conversa com o servidor ----------
async function api(body) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-key': config.key },
    body: JSON.stringify({ ...body, info: { version: VERSION, host: hostname(), platform: platform() } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Servidor respondeu ${res.status}`);
  return json;
}

let lastPrinters = '';
async function tick() {
  const { jobs = [], printers = [] } = await api({ action: 'poll' });
  const list = printers.map(p => `${p.name} (${p.address})`).join(', ');
  if (list !== lastPrinters) { log(printers.length ? `Impressoras: ${list}` : 'Nenhuma impressora "Agente local" cadastrada ainda.'); lastPrinters = list; }
  if (!jobs.length) return;
  const results = [];
  for (const job of jobs) {
    try {
      await print(job.printer.address, Buffer.from(job.data, 'base64'));
      log(`Impresso em ${job.printer.name}`);
      results.push({ job_id: job.job_id, ok: true });
    } catch (e) {
      log(`ERRO em ${job.printer.name}: ${e.message}`);
      results.push({ job_id: job.job_id, ok: false, error: e.message });
    }
  }
  await api({ action: 'ack', results });
}

log(`Oxys - agente de impressão ${VERSION} iniciado. Deixe esta janela aberta.`);
let failures = 0;
for (;;) {
  try {
    await tick();
    if (failures) log('Conexão restabelecida.');
    failures = 0;
  } catch (e) {
    failures++;
    if (failures === 1 || failures % 20 === 0) log(`Sem conexão com o servidor: ${e.message}`);
    if (/inv[aá]lida|ausente/i.test(e.message)) { console.error('Gere uma nova chave e rode: node oxys-print-agent.mjs NOVA_CHAVE'); process.exit(1); }
  }
  await new Promise(r => setTimeout(r, failures ? Math.min(30000, POLL_MS * failures) : POLL_MS));
}
