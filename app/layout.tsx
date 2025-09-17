import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Literature Screening Assistant',
  description: 'Upload Zotero exports, apply screening rules, and review triage decisions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
          <main className="flex-1">{children}</main>
          <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-600">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-base font-semibold text-slate-900">Connect with Me</p>
                <ul className="mt-3 space-y-2">
                  <li>
                    <a
                      href="https://x.com/hubeiqiao"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-slate-700 transition hover:text-slate-900"
                    >
                      <span>X/Twitter</span>
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">@hubeiqiao</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.linkedin.com/in/hubeiqiao/"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-slate-700 transition hover:text-slate-900"
                    >
                      <span>LinkedIn</span>
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">/in/hubeiqiao</span>
                    </a>
                  </li>
                </ul>
              </div>
              <div className="space-y-3 text-slate-600 md:text-right">
                <p>© 2025 Literature Screening Assistant. Built with OpenAI Codex.</p>
                <a
                  href="https://buy.stripe.com/6oEdTw8OQ86S0CYcMN"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow transition hover:bg-slate-700"
                >
                  Appreciate this magic? Buy me a coffee!
                </a>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
