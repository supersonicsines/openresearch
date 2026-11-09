import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({ reason: url.searchParams.get('reason') });
