'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';

export function MobileNav({ children }: Readonly<{ children: React.ReactNode }>) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        if (navRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
      }
    };
    const handleClick = (event: MouseEvent) => {
      if (
        navRef.current &&
        !navRef.current.contains(event.target as Node) &&
        !toggleRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('click', handleClick, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="mobile-nav-toggle"
        aria-expanded={open}
        aria-controls="site-main-nav"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        onClick={toggle}
      >
        {open ? '✕' : '☰'}
      </button>
      <nav
        ref={navRef}
        id="site-main-nav"
        className="site-nav"
        data-open={open ? 'true' : 'false'}
        aria-label="Main navigation"
      >
        {children}
      </nav>
    </>
  );
}
