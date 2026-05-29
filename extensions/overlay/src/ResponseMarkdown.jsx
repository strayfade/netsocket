import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderMarkdown = (text) => {
  const raw = marked.parse(String(text || ""), { async: false });
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
  });
};

export default function ResponseMarkdown({ text, onOpenLink }) {
  const html = useMemo(() => renderMarkdown(text), [text]);

  return (
    <div
      className="response-text markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        const anchor = event.target.closest("a");
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
        const href = anchor.getAttribute("href");
        if (href) onOpenLink?.(href);
      }}
    />
  );
}
