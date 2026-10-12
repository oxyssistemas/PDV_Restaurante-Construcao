/** Extrato bancário OFX (SGML ou XML), como os bancos exportam. */
export type OfxTxn = { fitid: string; posted_on: string; amount: number; memo: string };
export type OfxStatement = { account: string | null; balance: number | null; balance_on: string | null; transactions: OfxTxn[] };

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : null;
};
const date = (v: string | null) => (v && /^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);
const num = (v: string | null) => Number(String(v ?? '0').replace(',', '.')) || 0;

export function parseOfx(text: string): OfxStatement {
  if (!/<OFX>/i.test(text)) throw new Error('Arquivo inválido: não é um extrato OFX.');
  const blocks = text.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0]);
  const transactions = blocks.map((b, i) => {
    const posted = date(tag(b, 'DTPOSTED'));
    const memo = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' · ');
    return { fitid: tag(b, 'FITID') || `${posted}-${num(tag(b, 'TRNAMT'))}-${i}`, posted_on: posted ?? '', amount: num(tag(b, 'TRNAMT')), memo: memo.slice(0, 200) };
  }).filter(t => t.posted_on && t.amount !== 0);
  const bal = text.split(/<LEDGERBAL>/i)[1] ?? '';
  const acct = [tag(text, 'BANKID'), tag(text, 'BRANCHID'), tag(text, 'ACCTID')].filter(Boolean).join('/');
  return { account: acct || null, balance: bal ? num(tag(bal, 'BALAMT')) : null, balance_on: bal ? date(tag(bal, 'DTASOF')) : null, transactions };
}
