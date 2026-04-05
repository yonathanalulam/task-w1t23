import type { PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

export const load: PageServerLoad = async (event) => {
  const response = await fetchApi(event, '/workflow/reviewer/queue');
  if (!response.ok) {
    return { queue: [] };
  }

  const payload = (await response.json()) as { queue?: unknown[] };
  return {
    queue: payload.queue ?? []
  };
};
