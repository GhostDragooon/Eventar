export function IdentityAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || '?';
  const sizing = size === 'sm' ? 'size-8 text-label-md' : size === 'lg' ? 'size-14 text-title-lg' : 'size-10 text-label-md';
  return (
    <span
      title={name}
      aria-label={name}
      className={`inline-grid shrink-0 place-items-center rounded-full bg-primary-container font-label-md text-on-primary-container ${sizing}`}
    >
      {initials}
    </span>
  );
}
