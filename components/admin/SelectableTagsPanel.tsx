import { Button } from '@/components/ui/button';

export type SelectableTag = { id: string; label: string };

export function SelectableTagsPanel({
  tags,
  selected,
  onChange,
}: {
  tags: readonly SelectableTag[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="flex flex-wrap gap-sm" aria-label="Selectable tags">
      {tags.map((tag) => {
        const active = selected.includes(tag.id);
        return (
          <Button
            key={tag.id}
            type="button"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            onClick={() => toggle(tag.id)}
            className="min-h-11 px-md font-label-md text-label-md"
          >
            {active && <span aria-hidden>✓ </span>}
            {tag.label}
          </Button>
        );
      })}
    </div>
  );
}
