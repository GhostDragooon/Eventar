'use client';

import { useSyncExternalStore } from 'react';
import { readTheme, writeTheme, type Theme } from '@/lib/theme';

// SSR snapshot: localStorage doesn't exist on the server, so the initial
// render says "system". The FOUC script in app/layout.tsx has already
// applied the right .dark/.light class to <html> by the time hydration runs;
// the radio state catches up on first client snapshot. Bonus over useState
// + useEffect: 'storage' subscription syncs the pick across browser tabs.
function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

const OPTIONS: Array<{ value: Theme; label: string; description: string; icon: string }> = [
  { value: 'light',  label: 'Light',  description: 'Always use the light palette, regardless of OS.', icon: 'light_mode' },
  { value: 'dark',   label: 'Dark',   description: 'Always use the dark palette, regardless of OS.',  icon: 'dark_mode'  },
  { value: 'system', label: 'System', description: 'Follow your operating-system preference.',         icon: 'computer'   },
];

export default function SettingsClient() {
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    readTheme,
    () => 'system',
  );

  function pick(next: Theme) {
    writeTheme(next);
    // writeTheme doesn't fire a 'storage' event in the same tab; dispatch one
    // manually so useSyncExternalStore re-snapshots and the radio updates.
    window.dispatchEvent(new StorageEvent('storage', { key: 'eventar-theme' }));
  }

  return (
    <section
      aria-labelledby="appearance-heading"
      className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm max-w-2xl"
    >
      <div className="flex items-center gap-md mb-md">
        <div
          aria-hidden
          className="w-10 h-10 rounded-full bg-primary-fixed text-primary flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-[20px]">palette</span>
        </div>
        <h2 id="appearance-heading" className="font-headline-sm text-[20px] text-on-surface">
          Appearance
        </h2>
      </div>

      <div role="radiogroup" aria-labelledby="appearance-heading" className="space-y-sm">
        {OPTIONS.map((opt) => {
          const selected = theme === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex items-start gap-md p-md rounded-lg border cursor-pointer transition-colors ${
                selected
                  ? 'border-primary bg-primary-fixed'
                  : 'border-outline-variant hover:bg-surface-container-high'
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={opt.value}
                checked={selected}
                onChange={() => pick(opt.value)}
                className="sr-only"
              />
              <span
                className={`material-symbols-outlined text-[24px] mt-[2px] shrink-0 ${
                  selected ? 'text-primary' : 'text-on-surface-variant'
                }`}
                aria-hidden
                data-fill={selected ? '1' : undefined}
              >
                {opt.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-title-lg text-[16px] ${selected ? 'text-primary' : 'text-on-surface'}`}>
                  {opt.label}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
                  {opt.description}
                </p>
              </div>
              <span
                className={`material-symbols-outlined text-[20px] mt-[2px] shrink-0 ${
                  selected ? 'text-primary' : 'text-outline'
                }`}
                aria-hidden
                data-fill={selected ? '1' : undefined}
              >
                {selected ? 'radio_button_checked' : 'radio_button_unchecked'}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
