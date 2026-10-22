// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MobileNav } from './mobile-nav';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <MobileNav>
        <a href="/">Home</a>
      </MobileNav>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('mobile navigation interactions', () => {
  it('closes on a second toggle click even with the document outside-click listener active', () => {
    const toggle = container.querySelector('button')!;
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('returns focus from the closed menu to its toggle on Escape', () => {
    const toggle = container.querySelector('button')!;
    act(() => toggle.click());
    container.querySelector('a')!.focus();
    act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('closes when clicking outside the navigation', () => {
    const toggle = container.querySelector('button')!;
    act(() => toggle.click());
    act(() => document.body.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
