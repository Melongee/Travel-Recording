let session: {token: string; headerName: string} | undefined;
export async function api<T>(path: string, body?: unknown, method = 'POST', signal?: AbortSignal): Promise<T> {
  return (await apiResponse(path, body, method, signal)).json();
}
export async function apiResponse(path: string, body?: unknown, method = 'POST', signal?: AbortSignal): Promise<Response> {
  const headers: Record<string,string> = {};
  if (body !== undefined) {
    if (!session) session = await api('/session');
    if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    headers[session!.headerName] = session!.token;
  }
  const response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : method, headers, credentials: 'same-origin', signal, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  if (!response.ok) {
    if (response.status === 403) session = undefined;
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `请求失败（${response.status}），请刷新后重试`);
  }
  return response;
}
