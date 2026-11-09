import { listModels } from '#lib/server/openrouter.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const models = await listModels();
		return Response.json(
			{ models: models.map(({ id, name, pricing }) => ({ id, name, pricing })) },
			{ headers: { 'Cache-Control': 'public, max-age=600' } }
		);
	} catch {
		return Response.json({ message: 'The list of models could not be loaded.' }, { status: 502 });
	}
};
