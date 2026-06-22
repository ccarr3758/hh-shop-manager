export function registerPwaUpdateHandler(onUpdateAvailable) {
  if (!("serviceWorker" in navigator)) return () => {};

  let updateRegistration = null;
  let reloading = false;
  let updateInterval = null;

  function showUpdate(registration) {
    if (!registration?.waiting) return;
    updateRegistration = registration;
    onUpdateAvailable?.({
      applyUpdate: () => {
        if (!updateRegistration?.waiting) return;
        updateRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
      },
    });
  }

  function listenForWaitingWorker(registration) {
    if (!registration) return;

    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdate(registration);
      return;
    }

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdate(registration);
        }
      });
    });
  }

  function handleControllerChange() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { updateViaCache: "none" })
      .then((registration) => {
        listenForWaitingWorker(registration);

        updateInterval = window.setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 60 * 1000);

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update().catch(() => {});
        });
      })
      .catch((error) => {
        console.warn("Service worker registration failed", error);
      });
  });

  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

  return () => {
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    if (updateInterval) window.clearInterval(updateInterval);
  };
}
