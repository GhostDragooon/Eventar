/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EvidenceFileList } from './EvidenceFileList';

afterEach(cleanup);

describe('EvidenceFileList', () => {
  it('shows a Download link only for available files with a href', () => {
    render(
      <EvidenceFileList
        files={[
          { id: 'a', name: 'cert.pdf', sizeLabel: '1.2 MB', status: 'available', downloadHref: '/f/a' },
          { id: 'b', name: 'scan.pdf', sizeLabel: '2 MB', status: 'processing' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/f/a');
  });

  it('calls onRemove with the file id', () => {
    const onRemove = vi.fn();
    render(
      <EvidenceFileList
        files={[{ id: 'a', name: 'cert.pdf', sizeLabel: '1.2 MB', status: 'available' }]}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith('a');
  });
});
