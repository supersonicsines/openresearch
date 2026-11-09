declare global {
	namespace App {
		interface Locals {
			user: import('#lib/server/db.ts').User | null;
			/** Null where the visitor's real address cannot be determined. */
			address: string | null;
		}
		interface Error {
			message: string;
			status: number;
		}
	}
}

export {};
