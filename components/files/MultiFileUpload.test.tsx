/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MultiFileUpload } from './MultiFileUpload';
import type { SelectedFile } from './MultiFileUpload';

afterEach(cleanup);

function file(name: string, size: number) {
  return new File([new Uint8Array(size)], name);
}

describe('MultiFileUpload', () => {
  it('rejects a selection over maxFiles without calling onChange', () => {
    const onChange = vi.fn();
    render(
      <MultiFileUpload
        files={[{ id: '1', file: file('a.pdf', 10) }]}
        onChange={onChange}
        maxFiles={1}
        onSubmit={() => undefined}
      />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file('b.pdf', 10)] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/no more than 1 file/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a selected file and disables submit when the list is empty', () => {
    const onChange = vi.fn();
    const files: SelectedFile[] = [{ id: '1', file: file('a.pdf', 10) }];
    render(<MultiFileUpload files={files} onChange={onChange} onSubmit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /remove a.pdf/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('disables Submit files until a file is selected', () => {
    render(<MultiFileUpload files={[]} onChange={() => undefined} onSubmit={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Submit files' })).toBeDisabled();
  });
});
