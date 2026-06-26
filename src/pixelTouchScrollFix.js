// Pixel / Android PWA one-finger scroll guard.
// Some Android PWAs let app-level gesture handlers or transparent fixed layers steal
// the first touch pointer. When that happens the page still scrolls with two fingers,
// but not one. This guard restores normal one-finger vertical scrolling without
// changing taps, form controls, or horizontal tab swipes.

function isAndroidStandalonePwa() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
  return isAndroid && standalone;
}

function isTextInput(target) {
  return Boolean(target?.closest?.("textarea, input, select, [contenteditable='true']"));
}

function isHorizontalScroller(el) {
  if (!el || el === document.documentElement || el === document.body) return false;
  const style = window.getComputedStyle(el);
  return el.scrollWidth > el.clientWidth + 6 && /(auto|scroll)/.test(style.overflowX || "");
}

function canScrollY(el) {
  if (!el || el === document || el === window) return true;
  if (el === document.documentElement || el === document.body) return true;
  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY || "";
  return el.scrollHeight > el.clientHeight + 2 && /(auto|scroll|overlay)/.test(overflowY);
}

function nearestVerticalScroller(start) {
  let el = start?.nodeType === 1 ? start : start?.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    if (canScrollY(el)) return el;
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function scrollElement(el, deltaY) {
  if (!el || el === document.body || el === document.documentElement || el === document.scrollingElement) {
    window.scrollBy(0, deltaY);
  } else {
    el.scrollTop += deltaY;
  }
}

export function installPixelTouchScrollFix() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__hhPixelTouchScrollFixInstalled) return;
  window.__hhPixelTouchScrollFixInstalled = true;

  let active = null;

  const onTouchStart = (event) => {
    if (!isAndroidStandalonePwa()) return;
    if (event.touches.length !== 1) {
      active = null;
      return;
    }
    const touch = event.touches[0];
    active = {
      target: event.target,
      scroller: nearestVerticalScroller(event.target),
      startX: touch.clientX,
      startY: touch.clientY,
      lastY: touch.clientY,
      locked: false,
      horizontal: false,
      textInput: isTextInput(event.target),
    };
  };

  const onTouchMove = (event) => {
    if (!active || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const dx = touch.clientX - active.startX;
    const dyFromStart = touch.clientY - active.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dyFromStart);

    if (!active.locked && Math.max(absX, absY) < 7) return;

    if (!active.locked) {
      active.locked = true;
      active.horizontal = absX > absY && isHorizontalScroller(active.target?.closest?.(".mobileTabs, .sideNavGrouped, nav, .schedule"));
    }

    if (active.horizontal || active.textInput) {
      active.lastY = touch.clientY;
      return;
    }

    if (absY >= absX) {
      const deltaY = active.lastY - touch.clientY;
      if (deltaY) scrollElement(active.scroller, deltaY);
      active.lastY = touch.clientY;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const onTouchEnd = () => {
    active = null;
  };

  document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
  document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
  document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
  document.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });

  const style = document.createElement("style");
  style.id = "hh-pixel-touch-scroll-style";
  style.textContent = `
    @media (max-width: 768px) {
      html, body, #root { height: auto !important; min-height: 100dvh !important; overflow-y: auto !important; overscroll-behavior-y: auto !important; }
      body, .app.phoneShell, .phoneMain, .page, .mobileApp, main { touch-action: pan-y !important; }
      .mobileTabs, nav, .schedule { touch-action: pan-x pan-y !important; }
      .modalBackdrop[aria-hidden="true"], .drawerBackdrop.closed, .mobileOverlay.closed { pointer-events: none !important; }
    }
  `;
  document.head.appendChild(style);
}
