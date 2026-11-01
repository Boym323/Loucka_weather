import { isCurrentResponse, isHistoryResponse } from '../domain/weather';
import type { CurrentResponse, HistoryResponse } from '../domain/weather';

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    signal,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  });
  if (!response.ok) throw new Error('API HTTP ' + response.status);
  return response.json() as Promise<unknown>;
}

export async function getCurrent(signal?: AbortSignal): Promise<CurrentResponse> {
  const data = await request('/api/v1/current?units=metricwx&dataset=original', signal);
  if (!isCurrentResponse(data)) throw new Error('Neplatný formát aktuálních dat');
  return data;
}
export async function getHistory24h(metric: string, signal?: AbortSignal): Promise<HistoryResponse> {
  // This first slice supports one known metric; API enforces the allowlist.
  if (metric !== 'outTemp') throw new Error('Nepodporovaná veličina');
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    metric, from: from.toISOString(), to: to.toISOString(),
    resolution: 'raw', units: 'metricwx', dataset: 'original', limit: '500'
  });
  const data = await request('/api/v1/history?' + query.toString(), signal);
  if (!isHistoryResponse(data) || data.metric !== metric) throw new Error('Neplatný formát historie');
  return data;
}
