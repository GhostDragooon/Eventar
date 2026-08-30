/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GroupedSelect } from './GroupedSelect';

afterEach(cleanup);

describe('GroupedSelect', () => {
  it('renders the label and required marker', () => {
    render(
      <GroupedSelect
        label="Category"
        value=""
        groups={[{ label: 'Group', options: [{ value: 'a', label: 'A' }] }]}
        onChange={() => undefined}
        required
      />,
    );
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});
