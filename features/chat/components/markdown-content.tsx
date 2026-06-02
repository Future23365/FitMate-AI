"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// MarkdownContent 是 assistant 正文的重渲染边界，只在确实出现 Markdown 回复时加载。
export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-sm last:mb-0 font-body-md text-body-md">{children}</p>
        ),
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-sm list-disc space-y-xs pl-lg last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-sm list-decimal space-y-xs pl-lg last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li className="pl-xs font-body-md text-body-md">{children}</li>,
        h1: ({ children }) => (
          <h1 className="mb-sm font-headline-md text-headline-md font-bold">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-sm font-title-lg text-title-lg font-bold">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-xs font-label-md text-label-md font-bold">{children}</h3>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-sm border-l-4 border-primary-container pl-md text-on-surface-variant last:mb-0">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded-md bg-surface-container px-xs py-[2px] font-mono text-[0.9em]">
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
