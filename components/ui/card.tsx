import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside';
}) {
  return (
    <Tag className={`relative rounded-card border border-line bg-surface shadow-card ${className}`}>{children}</Tag>
  );
}

export function CardHeader({ eyebrow, title, aside }: { eyebrow?: string; title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h2 className="font-display text-lg font-semibold leading-none text-ink">{title}</h2>
      </div>
      {aside ? <div className="shrink-0 text-right">{aside}</div> : null}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="eyebrow mb-3 border-b border-line pb-2">{children}</p>;
}
