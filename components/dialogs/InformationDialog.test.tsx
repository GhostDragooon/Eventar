/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InformationDialog } from './InformationDialog';

afterEach(cleanup);

describe('InformationDialog', () => {
  it('calls onAcknowledge from the Continue action', () => {
    const onAcknowledge = vi.fn();
    render(
      <InformationDialog open onOpenChange={() => undefined} title="Heads up" onAcknowledge={onAcknowledge}>
        <p>Detail</p>
      </InformationDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });
});
