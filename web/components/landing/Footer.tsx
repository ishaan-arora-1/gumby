import { Logo } from '@/components/ui/Logo';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-16 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-white/45 leading-relaxed">
              The fastest way to ship UGC ads that don't look like ads.
            </p>
          </div>
          {[
            { h: 'Product', links: ['Features', 'Creators', 'Pricing', 'Changelog'] },
            { h: 'Resources', links: ['Examples', 'Templates', 'Help center', 'API docs'] },
            { h: 'Company', links: ['About', 'Twitter', 'Careers', 'Contact'] },
          ].map((col) => (
            <div key={col.h}>
              <div className="text-xs uppercase tracking-widest text-white/40 mb-4">
                {col.h}
              </div>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l}>
                    <Link
                      href="#"
                      className="text-sm text-white/70 hover:text-white transition"
                    >
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row gap-3 justify-between items-center text-xs text-white/35">
          <div>© {new Date().getFullYear()} Create UGC. All rights reserved.</div>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-white/70">Terms</Link>
            <Link href="#" className="hover:text-white/70">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
