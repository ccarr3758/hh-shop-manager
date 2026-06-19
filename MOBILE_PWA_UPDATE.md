# Mobile PWA Update

This update keeps the existing desktop workflow and adds app-style mobile installation support.

Included:
- Web app manifest for Add to Home Screen / installable PWA behavior.
- Service worker for app-shell caching. Supabase/API requests are not cached.
- Mobile-safe viewport and Apple home-screen metadata.
- H&H app icons for iPhone/Android home screen.
- Mobile install button where supported.
- iPhone Add to Home Screen hint.
- Safe-area spacing for iPhone bottom nav and header.

No Supabase SQL changes are required for this update.
