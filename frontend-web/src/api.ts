const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:8003" : "/api");
const DEV_DIRECT_API_BASE = "";

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function requestOnce<T>(base: string, path: string, init?: RequestInit, timeout = 60_000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const raw = await response.text();
    let data: any = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        if (!response.ok) throw new ApiError(`后端服务不可用 (${response.status})`, response.status);
        throw new ApiError("后端返回了无法解析的数据");
      }
    }
    if (!response.ok) throw new ApiError(data.detail || `后端服务不可用 (${response.status})`, response.status);
    if (data?.error && !data?.success) throw new ApiError(data.error);
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("请求超时，外部数据源暂未响应");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function request<T>(path: string, init?: RequestInit, timeout = 60_000): Promise<T> {
  const bases = DEV_DIRECT_API_BASE ? [API_BASE, DEV_DIRECT_API_BASE] : [API_BASE];
  let lastError: unknown;
  for (const base of bases) {
    try {
      return await requestOnce<T>(base, path, init, timeout);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export const api = {
  get: <T>(path: string, timeout?: number) => request<T>(path, undefined, timeout),
  post: <T>(path: string, body: unknown, timeout?: number) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, timeout),
  put: <T>(path: string, body: unknown, timeout?: number) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }, timeout),
};

export type JsonMap = Record<string, any>;

/** 解包后端响应信封：兼容 {item|items} 与 {data:{item|items}} 两种形态。 */
export function unwrapItems<T = any>(data: JsonMap | undefined): T[] {
  if (!data) return [];
  return (data.item || data.items || data.data?.item || data.data?.items || []) as T[];
}
