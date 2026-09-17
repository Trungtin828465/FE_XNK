/** Keep the backend hostname and gateway token out of the browser bundle. */
export function backendApiUrl(path: string): string {
  return `/api/xnk/${path.replace(/^\/+/, "")}`;
}
