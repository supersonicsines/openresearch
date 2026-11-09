import { randomBytes } from 'node:crypto';
import { MIN_DONATION_MICRO, minimumDonationMicro } from '#lib/budget.ts';
import { money } from '#lib/format.ts';
import { get, run } from '#lib/server/db.ts';
import { getPublicKey, readKey, updateKeyInfo } from '#lib/server/keys.ts';
import { HOUR, hit } from '#lib/server/limits.ts';
import { checkKey, findModel, OpenRouterError } from '#lib/server/openrouter.ts';
import { kick } from '#lib/server/worker.ts';
import type { RequestHandler } from './$types';

const reply = (status: number, message: string) => Response.json({ message }, { status });

/** Research is shared between projects, so one account cannot occupy all of it. */
const MAX_OPEN_DONATIONS = 3;

/** Far beyond any sensible donation. It exists to reject mistyped or malformed amounts. */
const MAX_DONATION_MICRO = 100_000 * 1_000_000;

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) return reply(401, 'An X account must be connected first.');
	const project = get<{ id: number }>('SELECT id FROM projects WHERE slug = ? AND hidden_at IS NULL', params.slug);
	if (!project) return reply(404, 'This project could not be found.');
	if (hit(`donate:${locals.user.id}`, 60, HOUR)) {
		return reply(429, 'Too many donations have been made from this account. The attempt may be repeated later.');
	}

	const body = (await request.json().catch(() => null)) as { amountMicro?: unknown; model?: unknown } | null;
	const amount = Number(body?.amountMicro);
	if (!Number.isSafeInteger(amount) || amount < MIN_DONATION_MICRO || amount > MAX_DONATION_MICRO) {
		return reply(400, 'The amount is not valid. An amount of at least $0.10 is required.');
	}
	const modelId = typeof body?.model === 'string' ? body.model : '';

	const key = readKey(locals.user.id);
	if (!key) return reply(400, 'An OpenRouter key must be added first.');

	const open = get<{ n: number }>(
		`SELECT COUNT(*) AS n FROM donations WHERE user_id = ? AND status IN ('queued','running')`,
		locals.user.id
	);
	if ((open?.n ?? 0) >= MAX_OPEN_DONATIONS) {
		return reply(429, `No more than ${MAX_OPEN_DONATIONS} donations may be in progress at once. A further donation may be made when one has finished.`);
	}

	let model;
	try {
		model = await findModel(modelId);
	} catch {
		return reply(502, 'OpenRouter could not be reached. The attempt may be repeated shortly.');
	}
	if (!model) return reply(400, 'This model is not offered by OpenRouter.');
	const smallest = minimumDonationMicro(model.pricing);
	if (amount < smallest) {
		return reply(400, `An amount of at least ${money(smallest)} is required for a run of this model.`);
	}

	try {
		const info = await checkKey(key);
		updateKeyInfo(locals.user.id, info);
		if (info.remainingMicro !== null && amount > info.remainingMicro) {
			return reply(400, "This amount exceeds what remains on the key's spending limit.");
		}
	} catch (err) {
		if (err instanceof OpenRouterError && (err.status === 401 || err.status === 403)) {
			return reply(400, 'The key is no longer accepted by OpenRouter. It should be replaced on the account page.');
		}
		return reply(502, 'OpenRouter could not be reached. The attempt may be repeated shortly.');
	}

	const publicId = randomBytes(8).toString('hex');
	run(
		`INSERT INTO donations (public_id, project_id, user_id, model, model_name, amount_micro, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)`,
		publicId,
		project.id,
		locals.user.id,
		model.id,
		model.name,
		amount,
		Date.now()
	);
	kick();
	return Response.json({ publicId, key: getPublicKey(locals.user.id) }, { status: 201 });
};
