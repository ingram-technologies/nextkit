export function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function assertResponseOk(
	response: Response,
	message: string,
): Promise<void> {
	if (response.ok) return;
	const body = await response.text().catch(() => "");
	throw new Error(
		`${message}: ${response.status} ${response.statusText}${
			body ? ` — ${body.slice(0, 300)}` : ""
		}`,
	);
}
