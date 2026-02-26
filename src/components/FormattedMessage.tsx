import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface FormattedMessageProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content (bold, italic, code, lists, headings, links, etc.)
 * using react-markdown with GitHub Flavored Markdown support.
 */
export default function FormattedMessage({ content, className = '' }: FormattedMessageProps) {
  if (!content) return null;

  return (
    <div className={`formatted-message ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold text-foreground mb-2 mt-3 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-foreground mb-1.5 mt-2.5 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-foreground mb-1 mt-2 first:mt-0">{children}</h3>
          ),
          // Paragraphs
          p: ({ children }) => (
            <p className="leading-relaxed mb-2 last:mb-0">{children}</p>
          ),
          // Bold
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          // Italic
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),
          // Inline code
          code: ({ children, className: codeClass }) => {
            // Check if it's a code block (has language class) vs inline code
            if (codeClass) {
              return (
                <code className="block bg-white/[0.06] rounded-md p-3 text-xs font-mono overflow-x-auto my-2">
                  {children}
                </code>
              );
            }
            return (
              <code className="px-1 py-0.5 bg-white/[0.08] rounded text-xs font-mono">
                {children}
              </code>
            );
          },
          // Code blocks
          pre: ({ children }) => (
            <pre className="bg-white/[0.04] rounded-md p-3 text-xs font-mono overflow-x-auto my-2">
              {children}
            </pre>
          ),
          // Unordered lists
          ul: ({ children }) => (
            <ul className="space-y-1 my-2">{children}</ul>
          ),
          // Ordered lists
          ol: ({ children }) => (
            <ol className="space-y-1 my-2 list-decimal list-inside">{children}</ol>
          ),
          // List items
          li: ({ children }) => (
            <li className="flex gap-2 pl-1">
              <span className="text-crimson/70 shrink-0 mt-0.5">•</span>
              <span className="flex-1">{children}</span>
            </li>
          ),
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-crimson hover:text-crimson-dark underline underline-offset-2 transition-colors"
            >
              {children}
            </a>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-crimson/30 pl-3 italic text-muted-foreground my-2">
              {children}
            </blockquote>
          ),
          // Horizontal rule
          hr: () => <hr className="border-white/[0.08] my-3" />,
          // Tables — styled for both light and dark mode
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-border/30">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/30">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/20">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-muted/10 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-foreground text-[11px] uppercase tracking-wide border-b border-border/30">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-foreground/80">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

