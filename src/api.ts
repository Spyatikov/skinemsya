import { API_URL, SUPABASE_ANON_KEY } from "./config";
import { authPayload } from "./platform";
import type { Group } from "./money";

export type LoadResult = { me: number; joined: string | null; groups: Group[]; ai?: boolean; bot?: string; admin?: boolean };

export async function call<T = { ok: true }>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!API_URL) throw new Error("Сервер ещё не настроен: не задан адрес API.");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (SUPABASE_ANON_KEY) headers.apikey = SUPABASE_ANON_KEY;
  let res: Response;
  try {
    res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify({ ...authPayload(), action, ...payload }) });
  } catch {
    throw new Error("Нет связи с сервером. Проверь интернет.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Ошибка сервера (${res.status})`);
  return body as T;
}
