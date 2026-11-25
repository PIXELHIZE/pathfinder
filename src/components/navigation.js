export function followNavigation(event, navigate, view, eventId) {
  const hasModifier = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (event.defaultPrevented || event.button !== 0 || hasModifier) return;
  event.preventDefault();
  navigate(view, eventId);
}
