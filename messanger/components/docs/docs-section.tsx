import Image from 'next/image';

import { DocsSection } from '@/lib/docs-content';

type Props = {
  section: DocsSection;
};

export function DocsSectionBlock({ section }: Props) {
  return (
    <section id={section.id} className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
      {section.body?.map((paragraph, index) => (
        <p key={`${section.id}-p-${index}`} className="text-sm text-white/80 leading-relaxed">
          {paragraph}
        </p>
      ))}
      {section.media?.type === 'image' ? (
        <div className="rounded-2xl border border-white/10 bg-[#0a1422]/90 p-4">
          <Image
            src={section.media.src}
            alt={section.media.alt}
            width={1600}
            height={900}
            sizes="(min-width: 1024px) 960px, 100vw"
            className="w-full rounded-xl border border-white/10 bg-[#09121e]/80"
          />
        </div>
      ) : null}
      {section.bullets ? (
        <ul className="space-y-2 text-sm text-white/80">
          {section.bullets.map((item) => (
            <li key={`${section.id}-${item}`} className="flex items-start gap-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {section.code ? (
        <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0a1422]/90 p-4 text-xs text-white/80">
          <code className={`language-${section.code.language} font-mono`}>
            {section.code.value}
          </code>
        </pre>
      ) : null}
      {section.note ? (
        <div className="rounded-2xl border border-white/10 bg-[#0b1626]/85 p-4 text-sm text-white/80">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">
            {section.note.title}
          </div>
          <p className="mt-2">{section.note.body}</p>
        </div>
      ) : null}
    </section>
  );
}
