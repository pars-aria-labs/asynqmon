import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// Route components are lazy-loaded. Give cold CI workers enough time to
// resolve and render the first MUI-heavy route while test files run in
// parallel. Focused tests normally settle much sooner.
configure({ asyncUtilTimeout: 10000 });

afterEach(cleanup);
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi
    .fn()
    .mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
});
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
window.ROOT_PATH = "";
window.READ_ONLY = false;
window.PROMETHEUS_CONFIGURED = false;
