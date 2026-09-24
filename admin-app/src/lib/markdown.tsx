/**
 * markdown.tsx — tiny, dependency-free Markdown → JSX renderer.
 *
 * admin-app has no markdown library in its dependencies (checked before
 * writing this — package.json only has jspdf/recharts/lucide/radix-less UI
 * primitives), and pulling one in for two read-only internal notes pages
 * felt like the wrong tradeoff. This covers exactly what the Cherry notes
 * actually use: headings, bold, inline code, fenced code blocks, links,
 * bullet/numbered lists, GFM pipe tables, blockquotes and horizontal rules.
 * It is a renderer, not a parser for arbitrary Markdown — unsupported syntax
 * just falls through as a plain paragraph, which is fine for this use case.
 */
import type { ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  // bold | inline code | link — first match wins, scanned left to right.
  const re = /(\*\*(.+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+)\]\(([^)]+)\))/;
  while (rest.length) {
    const m = re.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[2] !== undefined) {
      out.push(<strong key={`${keyPrefix}-b${key++}`}>{renderInline(m[2], `${keyPrefix}-b${key}`)}</strong>);
    } else if (m[4] !== undefined) {
      out.push(
        <code
          key={`${keyPrefix}-c${key++}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground/90"
        >
          {m[4]}
        </code>,
      );
    } else if (m[6] !== undefined && m[7] !== undefined) {
      out.push(
        <a
          key={`${keyPrefix}-a${key++}`}
          href={m[7]}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {m[6]}
        </a>,
      );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre
          key={`b${key++}`}
          className="overflow-x-auto rounded-lg border border-border bg-[#0b0c0f] p-3 text-[12px] leading-relaxed text-foreground/90"
        >
          <code className={lang ? `language-${lang}` : undefined}>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(<hr key={`b${key++}`} className="my-2 border-border" />);
      i++;
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const cls =
        level === 1
          ? "mt-5 mb-2 text-lg font-semibold text-foreground first:mt-0"
          : level === 2
            ? "mt-5 mb-2 border-b border-border pb-1.5 text-[15px] font-semibold text-foreground first:mt-0"
            : "mt-4 mb-1.5 text-sm font-semibold text-foreground/90";
      const Tag = (`h${Math.min(level, 4)}` as unknown) as keyof JSX.IntrinsicElements;
      blocks.push(
        <Tag key={`b${key++}`} className={cls}>
          {renderInline(text, `h${key}`)}
        </Tag>,
      );
      i++;
      continue;
    }

    // Table (header row + separator row)
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={`b${key++}`} className="my-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {header.map((c, ci) => (
                  <th key={ci} className="px-2.5 py-1.5 text-left font-semibold text-foreground/90">
                    {renderInline(c, `th${key}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border/60 last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2.5 py-1.5 align-top text-muted-foreground">
                      {renderInline(c, `td${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={`b${key++}`}
          className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground"
        >
          {renderInline(quote.join(" "), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`b${key++}`} className="my-2 ml-4 list-disc space-y-1 text-foreground/85 marker:text-muted-foreground">
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, `li${key}-${ii}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`b${key++}`} className="my-2 ml-4 list-decimal space-y-1 text-foreground/85 marker:text-muted-foreground">
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, `oli${key}-${ii}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Front-matter style "key: value" line inside a --- block: treat as plain paragraph too (fallthrough).

    // Paragraph — gather until a blank line or a new block start.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i].trim()) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`b${key++}`} className="my-1.5 leading-relaxed text-foreground/85">
        {renderInline(para.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <div className="text-[13px]">{blocks}</div>;
}
