type AnimatedHeadingProps = {
  text: string;
  className?: string;
};

// Auth page titles used to play a per-glyph blur-in. These render plainly so
// the auth screens stay quiet and quick.
export function AnimatedPageTitle({ text, className }: AnimatedHeadingProps) {
  const lines = text.split("\n");
  return (
    <h1 className={className}>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">
          {line}
        </span>
      ))}
    </h1>
  );
}

function AnimatedSectionHeading({ text, className }: AnimatedHeadingProps) {
  const lines = text.split("\n");
  return (
    <h2 className={className}>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">
          {line}
        </span>
      ))}
    </h2>
  );
}
