/**
 * Shared Vitest setup, loaded via `setupFiles`. Keep this lean — it runs before
 * every test file in consuming projects.
 *
 * - Registers `@testing-library/jest-dom` matchers (toBeInTheDocument, etc.).
 * - Mocks `next/navigation` so components using `useRouter`/`usePathname`/
 *   `useSearchParams` render in isolation without a real router.
 */
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
		refresh: vi.fn(),
		prefetch: vi.fn(),
	}),
	usePathname: () => "/",
	useSearchParams: () => new URLSearchParams(),
	useParams: () => ({}),
	redirect: vi.fn(),
	notFound: vi.fn(),
}));
