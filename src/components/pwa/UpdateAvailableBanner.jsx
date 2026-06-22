export default function UpdateAvailableBanner({ update, onDismiss }) {
  if (!update) return null;

  return (
    <div className="pwaUpdateBanner" role="status" aria-live="polite">
      <div>
        <strong>Update available</strong>
        <span>Install the latest H&amp;H Shop Manager version.</span>
      </div>
      <div className="pwaUpdateActions">
        <button type="button" className="secondary small" onClick={onDismiss}>Later</button>
        <button type="button" className="primary small" onClick={update.applyUpdate}>Update</button>
      </div>
    </div>
  );
}
