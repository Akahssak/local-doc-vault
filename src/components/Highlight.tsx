import { toSegments } from '@/lib/search/search';

interface Props {
  text: string;
  ranges: Array<[number, number]>;
}

/** Render a line with matched ranges wrapped in <mark>. */
export function Highlight({ text, ranges }: Props) {
  const segments = toSegments(text, ranges);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark key={i} className="mark">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
