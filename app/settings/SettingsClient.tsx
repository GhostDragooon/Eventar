'use client';

import { useSyncExternalStore } from 'react';
import { readTheme, writeTheme, type Theme } from '@/lib/theme';
import { readTextSize, writeTextSize, type TextSize } from '@/lib/textSize';
import { SignOutButton } from '@/components/shell/SignOutButton';

// SSR snapshot: localStorage doesn't exist on the server, so the initial
// render uses the defaults. The FOUC script in app/layout.tsx has already
// applied the right classes to <html> by the time hydration runs; the
// radio state catches up on the first client snapshot. Bonus over
// useState + useEffect: 'storage' subscription syncs picks across tabs.
function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

type ThemeOpt   = { value: Theme;    label: string; description: string; icon: string };
type TextOpt    = { value: TextSize; label: string; description: string; icon: string };

const THEME_OPTIONS: ThemeOpt[] = [
  { value: 'light',  label: 'Light',  description: 'Always use the light palette, regardless of OS.', icon: 'light_mode' },
  { value: 'dark',   label: 'Dark',   description: 'Always use the dark palette, regardless of OS.',  icon: 'dark_mode'  },
  { value: 'system', label: 'System', description: 'Follow your operating-system preference.',         icon: 'computer'   },
];

const TEXT_OPTIONS: TextOpt[] = [
  { value: 'small',   label: 'Small',   description: 'Tighter type for fitting more on screen.',     icon: 'text_decrease' },
  { value: 'default', label: 'Default', description: 'Standard size — 16 px body text.',            icon: 'text_format'   },
  { value: 'large',   label: 'Large',   description: 'Roomier type — easier reading from a tablet.', icon: 'text_increase' },
];

const ROLE_LABELS: Record<'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff', string> = {
  organiser_admin:  'Organiser Admin',
  organiser_member: 'Organiser',
  body_admin:       'Body Admin',
  auditor:          'Auditor',
  eventar_staff:    'Eventar Staff',
};

export default function SettingsClient({
  staff,
}: {
  staff: { email: string; role: 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff' };
}) {
  const theme = useSyncExternalStore<Theme>(
    subscribeStorage,
    readTheme,
    () => 'system',
  );
  const textSize = useSyncExternalStore<TextSize>(
    subscribeStorage,
    readTextSize,
    () => 'default',
  );

  function pickTheme(next: Theme) {
    writeTheme(next);
    notifyStorage();
  }
  function pickTextSize(next: TextSize) {
    writeTextSize(next);
    notifyStorage();
  }

  return (
    <div className="space-y-md max-w-2xl">
      <SettingsSection icon="palette" title="Appearance">
        <RadioCardGroup
          name="theme"
          ariaLabel="Appearance"
          options={THEME_OPTIONS}
          selected={theme}
          onPick={pickTheme}
        />
      </SettingsSection>

      <SettingsSection icon="format_size" title="Text size">
        <RadioCardGroup
          name="text-size"
          ariaLabel="Text size"
          options={TEXT_OPTIONS}
          selected={textSize}
          onPick={pickTextSize}
        />
        <p className="font-body-md text-body-md text-on-surface-variant mt-md">
          Some icons and badges keep a fixed size for layout consistency.
        </p>
      </SettingsSection>

      <SettingsSection icon="person" title="Account">
        <dl className="space-y-md">
          <Field label="Email" value={staff.email} />
          <Field label="Role" value={ROLE_LABELS[staff.role]} />
        </dl>
        <div className="mt-lg pt-md border-t border-outline-variant">
          <SignOutButton className="inline-flex items-center gap-sm bg-surface-container-high text-on-surface font-label-md text-label-md rounded-lg py-sm px-lg hover:bg-surface-container-highest transition-colors" />
        </div>
      </SettingsSection>
    </div>
  );
}

function notifyStorage() {
  // writeTheme / writeTextSize don't fire 'storage' in the same tab — dispatch
  // a synthetic one so our useSyncExternalStore re-snapshots and the radio
  // updates. Cross-tab still works via the real browser-fired event.
  window.dispatchEvent(new StorageEvent('storage'));
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm">
      <div className="flex items-center gap-md mb-md">
        <div
          aria-hidden
          className="w-10 h-10 rounded-full bg-primary-fixed text-primary flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <h2 className="font-headline-sm text-[20px] text-on-surface">{title}</h2>
      </div>
      {children}
    </section>
  );
}

type RadioOption<V extends string> = { value: V; label: string; description: string; icon: string };

function RadioCardGroup<V extends string>({
  name,
  ariaLabel,
  options,
  selected,
  onPick,
}: {
  name: string;
  ariaLabel: string;
  options: ReadonlyArray<RadioOption<V>>;
  selected: V;
  onPick: (next: V) => void;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="space-y-sm">
      {options.map((opt) => {
        const isSelected = selected === opt.value;
        return (
          <label
            key={opt.value}
            className={`flex items-start gap-md p-md rounded-lg border cursor-pointer transition-colors ${
              isSelected
                ? 'border-primary bg-primary-fixed'
                : 'border-outline-variant hover:bg-surface-container-high'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={isSelected}
              onChange={() => onPick(opt.value)}
              className="sr-only"
            />
            <span
              className={`material-symbols-outlined text-[24px] mt-[2px] shrink-0 ${
                isSelected ? 'text-primary' : 'text-on-surface-variant'
              }`}
              aria-hidden
              data-fill={isSelected ? '1' : undefined}
            >
              {opt.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`font-title-lg text-[16px] ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                {opt.label}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
                {opt.description}
              </p>
            </div>
            <span
              className={`material-symbols-outlined text-[20px] mt-[2px] shrink-0 ${
                isSelected ? 'text-primary' : 'text-outline'
              }`}
              aria-hidden
              data-fill={isSelected ? '1' : undefined}
            >
              {isSelected ? 'radio_button_checked' : 'radio_button_unchecked'}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">{label}</dt>
      <dd className="font-body-lg text-body-lg text-on-surface mt-xs">{value}</dd>
    </div>
  );
}
