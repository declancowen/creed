import { Fragment, type ReactNode } from "react";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Renders comment text with "@Display Name" mentions emphasised. Mentions are
// matched against the known workspace display names (longest first so a name
// that is a prefix of another doesn't win). Styled bold + accent colour, no
// underline - reads like a link without pretending to be one.
export function MentionText({
  text,
  mentionLabels,
}: {
  text: string;
  mentionLabels: string[];
}): ReactNode {
  const labels = mentionLabels
    .filter((label) => label.trim().length > 0)
    .sort((a, b) => b.length - a.length);

  if (labels.length === 0) {
    return text;
  }

  const pattern = new RegExp(`@(?:${labels.map(escapeRegExp).join("|")})`, "g");
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    nodes.push(
      <span key={key++} className="font-semibold text-[var(--creed-accent)]">
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return nodes;
}
