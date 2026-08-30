/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProfileSettingsDialog } from './ProfileSettingsDialog';

afterEach(cleanup);

describe('ProfileSettingsDialog', () => {
  it('calls onSave and shows a pending label', () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <ProfileSettingsDialog open onOpenChange={() => undefined} onSave={onSave}>
        <p>Fields</p>
      </ProfileSettingsDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledOnce();

    rerender(
      <ProfileSettingsDialog open onOpenChange={() => undefined} onSave={onSave} pending>
        <p>Fields</p>
      </ProfileSettingsDialog>,
    );
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
