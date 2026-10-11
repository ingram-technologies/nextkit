import { describe, expect, it } from "vitest";
import { DEFAULT_WORDS_PER_MINUTE, readingTime } from "./reading-time.js";

const words = (count: number): string =>
	Array.from({ length: count }, () => "w").join(" ");

describe("readingTime", () => {
	it("never reports under one minute, even for an empty body", () => {
		expect(readingTime("")).toMatchObject({ words: 0, minutes: 1 });
		expect(readingTime("  \n\t ")).toMatchObject({ words: 0, minutes: 1 });
	});

	it("rounds a partial minute up", () => {
		expect(readingTime(words(DEFAULT_WORDS_PER_MINUTE)).minutes).toBe(1);
		expect(readingTime(words(DEFAULT_WORDS_PER_MINUTE + 1)).minutes).toBe(2);
	});

	it("counts words across any whitespace run", () => {
		expect(readingTime("one\ttwo\n\nthree   four").words).toBe(4);
	});

	it("honors a custom wordsPerMinute", () => {
		const result = readingTime(words(100), 50);
		expect(result.minutes).toBe(2);
		expect(result.text).toContain("2");
	});
});
