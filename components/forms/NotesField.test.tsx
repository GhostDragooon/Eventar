/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NotesField } from './NotesField';

afterEach(cleanup);

describe('NotesField', () => {
  it('reports notes length', () => {
    render(<NotesField value="abc" onChange={() => undefined} maxLength={10} />);
    expect(screen.getByText('3 of 10')).toBeInTheDocument();
  });
});
