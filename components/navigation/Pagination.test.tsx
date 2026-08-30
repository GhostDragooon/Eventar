/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Pagination } from './Pagination';

afterEach(cleanup);

describe('Pagination', () => {
  it('changes pages and marks the current page', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={3} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(<Pagination page={1} pageCount={50} onPageChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    rerender(<Pagination page={50} pageCount={50} onPageChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('truncates a large page count to the endpoints plus a window round the current page', () => {
    render(<Pagination page={25} pageCount={50} onPageChange={() => undefined} />);

    for (const value of [1, 24, 25, 26, 50]) {
      expect(screen.getByRole('button', { name: `Page ${value}` })).toBeInTheDocument();
    }
    for (const value of [2, 23, 27, 49]) {
      expect(screen.queryByRole('button', { name: `Page ${value}` })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Page 25' })).toHaveAttribute('aria-current', 'page');
    // 5 page buttons + Previous + Next, not 52.
    expect(screen.getAllByRole('button')).toHaveLength(7);
  });

  it('keeps every page reachable when nothing needs collapsing', () => {
    render(<Pagination page={2} pageCount={4} onPageChange={() => undefined} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument();
  });

  it('renders each collapsed run as inert decoration, never as a control', () => {
    const { container } = render(<Pagination page={25} pageCount={50} onPageChange={() => undefined} />);

    const gaps = [...container.querySelectorAll('li')].filter((li) => li.textContent === '…');
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) {
      expect(gap).toHaveAttribute('aria-hidden', 'true');
      expect(gap.querySelector('button, a, [tabindex]')).toBeNull();
    }
    // Nothing announces the skipped run as a page.
    expect(screen.queryByRole('button', { name: /…/ })).not.toBeInTheDocument();
  });
});
