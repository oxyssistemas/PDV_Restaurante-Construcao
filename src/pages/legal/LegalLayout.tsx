import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import oxysLogo from '@/assets/oxys-logo.png';

export const COMPANY = 'Oxys Sistemas';
export const PRODUCT = 'Oxys Restaurante';
export const CONTACT_EMAIL = 'oxyssistemas@gmail.com';
export const SITE = 'https://www.oxysrestaurante.app';

export type LegalSection = { id: string; title: string; body: ReactNode };

export function Mail() {
  return <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a>;
}

export default function LegalLayout({ title, updatedAt, intro, sections }: {
  title: string; updatedAt: string; intro: ReactNode; sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/login" className="flex items-center gap-3">
            <img src={oxysLogo} alt={PRODUCT} className="h-10 w-10 rounded-md object-contain" />
            <span className="font-semibold">{PRODUCT}</span>
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link to="/termos" className="hover:text-foreground">Termos</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: {updatedAt}</p>
        <div className="mt-6 space-y-3 leading-relaxed text-muted-foreground">{intro}</div>

        <nav aria-label="Índice" className="mt-8 rounded-lg border p-4">
          <p className="mb-2 text-sm font-semibold">Índice</p>
          <ol className="gap-6 text-sm sm:columns-2">
            {sections.map((s, i) => (
              <li key={s.id} className="mb-1 break-inside-avoid"><a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">{i + 1}. {s.title}</a></li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="text-xl font-semibold">{i + 1}. {s.title}</h2>
              <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {COMPANY}. Dúvidas: <Mail />
        </div>
      </footer>
    </div>
  );
}
