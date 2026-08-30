/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsCards } from './SettingsCards';

afterEach(cleanup);

describe('SettingsCards', () => {
  it('toggles an option on click', () => {
    const onChange = vi.fn();
    render(
      <SettingsCards
        options={[{ id: 'a', title: 'Option A', description: 'desc' }]}
        selected={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });
});
