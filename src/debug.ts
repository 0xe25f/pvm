// Oi mate! This is a coo!
export function setDebugState(values: Record<string, string | number | boolean | undefined>): void {
  if (!import.meta.env.DEV) {
    return;
  }

  for (const [key, value] of Object.entries(values)) {
    const attr = `pvm${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    if (value === undefined) {
      delete document.body.dataset[attr];
    } else {
      document.body.dataset[attr] = String(value);
    }
  }
}
