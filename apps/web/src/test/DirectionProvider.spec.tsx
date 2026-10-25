import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  DirectionProvider,
  useDirection,
} from '../components/providers/direction-provider';

function TestDirectionConsumer() {
  const { dir, locale, toggleDirection, setDirection, isRtl } = useDirection();
  return (
    <div>
      <span data-testid="current-dir">{dir}</span>
      <span data-testid="current-locale">{locale}</span>
      <span data-testid="is-rtl">{isRtl ? 'yes' : 'no'}</span>
      <button onClick={toggleDirection} data-testid="toggle-btn">
        Toggle
      </button>
      <button onClick={() => setDirection('ltr')} data-testid="set-ltr-btn">
        Set LTR
      </button>
      <button onClick={() => setDirection('rtl')} data-testid="set-rtl-btn">
        Set RTL
      </button>
    </div>
  );
}

describe('DirectionProvider Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dir = '';
    document.documentElement.lang = '';
  });

  it('initializes with default rtl direction and ar locale', () => {
    render(
      <DirectionProvider defaultDirection="rtl" defaultLocale="ar">
        <TestDirectionConsumer />
      </DirectionProvider>,
    );

    expect(screen.getByTestId('current-dir')).toHaveTextContent('rtl');
    expect(screen.getByTestId('current-locale')).toHaveTextContent('ar');
    expect(screen.getByTestId('is-rtl')).toHaveTextContent('yes');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('toggles direction between rtl and ltr', () => {
    render(
      <DirectionProvider defaultDirection="rtl" defaultLocale="ar">
        <TestDirectionConsumer />
      </DirectionProvider>,
    );

    const toggleBtn = screen.getByTestId('toggle-btn');
    fireEvent.click(toggleBtn);

    expect(screen.getByTestId('current-dir')).toHaveTextContent('ltr');
    expect(screen.getByTestId('current-locale')).toHaveTextContent('en');
    expect(screen.getByTestId('is-rtl')).toHaveTextContent('no');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');

    // Toggle back to rtl
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('current-dir')).toHaveTextContent('rtl');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('persists direction in localStorage under "uacm-dir"', () => {
    render(
      <DirectionProvider defaultDirection="rtl" defaultLocale="ar">
        <TestDirectionConsumer />
      </DirectionProvider>,
    );

    const setLtrBtn = screen.getByTestId('set-ltr-btn');
    fireEvent.click(setLtrBtn);

    expect(localStorage.getItem('uacm-dir')).toBe('ltr');
    expect(localStorage.getItem('uacm-locale')).toBe('en');
  });
});
