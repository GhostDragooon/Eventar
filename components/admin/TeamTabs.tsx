'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { IdentityAvatar } from './IdentityAvatar';

export type Team = {
  id: string;
  label: string;
  members: readonly { id: string; name: string; role: string; available: boolean }[];
};

export function TeamTabs({ teams, onMessage }: { teams: readonly Team[]; onMessage: (id: string) => void }) {
  const [active, setActive] = useState(teams[0]?.id ?? '');
  const team = teams.find((x) => x.id === active);

  return (
    <section>
      <div role="tablist" aria-label="Teams" className="flex gap-xs overflow-auto border-b border-outline-variant">
        {teams.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === active}
            onClick={() => setActive(x.id)}
            className={
              x.id === active
                ? 'min-h-11 border-b-2 border-primary px-md text-primary-ink'
                : 'min-h-11 px-md text-on-surface-variant'
            }
          >
            {x.label}
          </button>
        ))}
      </div>
      <ul role="tabpanel" className="divide-y divide-outline-variant rounded-b-[20px] border border-t-0 border-outline-variant bg-surface-container-lowest">
        {team?.members.map((member) => (
          <li key={member.id} className="flex items-center gap-md p-md">
            <IdentityAvatar name={member.name} />
            <div className="min-w-0 flex-1">
              <strong className="block text-on-surface">{member.name}</strong>
              <span className="text-on-surface-variant">{member.role}</span>
            </div>
            <span className={member.available ? 'text-success' : 'text-on-surface-variant'}>
              <span className="mr-xs inline-block size-2 rounded-full bg-current" aria-hidden />
              {member.available ? 'Available' : 'Unavailable'}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={!member.available}
              onClick={() => onMessage(member.id)}
              className="min-h-11 px-md text-label-md"
            >
              Message
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
