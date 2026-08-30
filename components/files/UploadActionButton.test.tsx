/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UploadActionButton } from './UploadActionButton';

afterEach(cleanup);

describe('UploadActionButton', () => {
  it('calls onChoose and shows the selected count', () => {
    const onChoose = vi.fn();
    render(<UploadActionButton count={2} onChoose={onChoose} />);
    const button = screen.getByRole('button', { name: /choose files/i });
    expect(button).toHaveTextContent('2');
    fireEvent.click(button);
    expect(onChoose).toHaveBeenCalledOnce();
  });
});
