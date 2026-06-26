// Android installed-PWA scroll guard.
// Some Pixel/PWA combinations can let a child gesture layer capture one-finger
// vertical touch movement while two-finger scrolling still works. This capture
// shim restores normal one-finger vertical scrolling without changing desktop.

function isInteractiveElement(el) {
  return Boolean(el?.closest?.('input, textarea, select, button, a, label, [contenteditable="true"], [role="button"], .mobileDamageUpload'));
}

function getScrollableAncestor(start) {
  let node = start instanceof Element ? start : null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const canScrollY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight + 2;
    if (canScrollY) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export function installPixelTouchScrollFix() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (window.__hhPixelTouchScrollFixInstalled) return () => {};

  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isStandalonePwa = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
  const isTouchDevice = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;

  if (!isAndroid || !isTouchDevice) return () => {};

  window.__hhPixelTouchScrollFixInstalled = true;
  document.documentElement.classList.add('hh-android-touch-scroll-fix');
  if (isStandalonePwa) document.documentElement.classList.add('hh-android-pwa-touch-scroll-fix');

  let active = null;

  function onTouchStart(event) {
    if (event.touches.length !== 1) {
      active = null;
      return;
    }

    const touch = event.touches[0];
    const target = event.target;
    active = {
      target,
      scrollTarget: getScrollableAncestor(target),
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      moved: false,
      lockedVertical: false,
      interactive: isInteractiveElement(target),
    };
  }

  function onTouchMove(event) {
    if (!active || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const totalDx = touch.clientX - active.startX;
    const totalDy = touch.clientY - active.startY;
    const dx = touch.clientX - active.lastX;
    const dy = touch.clientY - active.lastY;
    const absX = Math.abs(totalDx);
    const absY = Math.abs(totalDy);

    if (!active.lockedVertical) {
      if (absY < 8 && absX < 8) return;
      if (absX > absY) {
        active = null;
        return;
      }
      active.lockedVertical = true;
    }

    // Let form controls/buttons receive taps. Once the gesture becomes a real
    // vertical drag, take over scrolling so captured child gestures cannot block it.
    if (active.interactive && absY < 18) return;

    const scroller = active.scrollTarget || document.scrollingElement || document.documentElement;
    const before = scroller.scrollTop;
    scroller.scrollTop = before - dy;

    if (scroller.scrollTop === before && scroller !== document.scrollingElement && scroller !== document.documentElement) {
      const root = document.scrollingElement || document.documentElement;
      root.scrollTop = root.scrollTop - dy;
    }

    active.lastX = touch.clientX;
    active.lastY = touch.clientY;
    active.moved = true;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  }

  function onTouchEnd() {
    active = null;
  }

  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });

  return () => {
    document.removeEventListener('touchstart', onTouchStart, { capture: true });
    document.removeEventListener('touchmove', onTouchMove, { capture: true });
    document.removeEventListener('touchend', onTouchEnd, { capture: true });
    document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
    window.__hhPixelTouchScrollFixInstalled = false;
  };
}
