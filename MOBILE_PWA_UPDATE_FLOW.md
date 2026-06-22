# Mobile PWA Update Flow

This build adds a proper installed-app update flow for technicians.

## Behavior

- Technicians do not need to delete and re-add the home-screen bookmark after every deployment.
- The service worker checks for new versions on launch, when the app returns to the foreground, and every 30 minutes while open.
- When a new version is ready, the app shows an in-app **Update available** banner.
- Tapping **Update** activates the new service worker and reloads the app once.
- Supabase/API requests are never cached by the service worker.
- Navigation requests use network-first behavior so the latest deployed app shell is preferred.

## Files

- `public/service-worker.js`
- `src/pwaUpdates.js`
- `src/components/pwa/UpdateAvailableBanner.jsx`
- `src/App.jsx`
- `src/main.jsx`
- `src/styles.css`

## Deployment Note

For future major deployments, update `CACHE_VERSION` in `public/service-worker.js` so installed PWAs detect a new version immediately.
