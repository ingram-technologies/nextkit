export const DEFAULT_WORDS_PER_MINUTE = 220;

export interface ReadingTime {
	words: number;
	minutes: number;
	/** e.g. "5 min read". */
	text: string;
}

/** Real reading time from the body — replaces the fleet's faked "5 min read". */
export function readingTime(
	content: string,
	wordsPerMinute: number = DEFAULT_WORDS_PER_MINUTE,
): ReadingTime {
	const words = content
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0).length;
	const minutes = Math.max(1, Math.ceil(words / wordsPerMinute));
	return { words, minutes, text: `${minutes} min read` };
}
