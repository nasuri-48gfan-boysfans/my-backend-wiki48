/* Set this to the public Express URL when frontend and backend use different domains. */
window.WIKI48_API_BASE = '';

window.wiki48ApiUrl = function wiki48ApiUrl(path) {
  return `${window.WIKI48_API_BASE.replace(/\/$/, '')}${path}`;
};
