/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScrollableInformationDialog } from './ScrollableInformationDialog';

afterEach(cleanup);

describe('ScrollableInformationDialog', () => {
  it('renders each section heading and content', () => {
    render(
      <ScrollableInformationDialog
        open
        onOpenChange={() => undefined}
        title="Accreditation details"
        sections={[
          { id: 'a', heading: 'Scope', content: 'Covers all tracks.' },
          { id: 'b', heading: 'Renewal', content: 'Annual.' },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Scope' })).toBeInTheDocument();
    expect(screen.getByText('Covers all tracks.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Renewal' })).toBeInTheDocument();
  });
});
