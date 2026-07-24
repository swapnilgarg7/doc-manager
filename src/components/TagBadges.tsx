export function TagBadges({
  tags,
  onClick,
}: {
  tags: string[];
  onClick?: (tag: string) => void;
}) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => {
        const cls =
          "badge bg-brand-50 text-brand-700 ring-1 ring-brand-100 max-w-[180px] truncate";
        return onClick ? (
          <button
            key={tag}
            type="button"
            onClick={() => onClick(tag)}
            className={`${cls} hover:bg-brand-100`}
            title={`Search “${tag}”`}
          >
            {tag}
          </button>
        ) : (
          <span key={tag} className={cls}>
            {tag}
          </span>
        );
      })}
    </div>
  );
}
