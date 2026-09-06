import React from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import App from "./App";
import store from "./store";

jest.mock("./views/SchedulersView", () => () => null);
jest.mock("./views/DashboardView", () => () => null);
jest.mock("./views/TasksView", () => () => null);
jest.mock("./views/TaskDetailsView", () => () => null);
jest.mock("./views/SettingsView", () => () => null);
jest.mock("./views/ServersView", () => () => null);
jest.mock("./views/RedisInfoView", () => () => null);
jest.mock("./views/MetricsView", () => () => null);
jest.mock("./views/PageNotFoundView", () => () => null);

beforeAll(() => {
  window.ROOT_PATH = "";
  window.PROMETHEUS_SERVER_ADDRESS = "";
  window.READ_ONLY = false;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
});

test("renders the primary navigation", () => {
  render(
    <Provider store={store}>
      <App />
    </Provider>
  );

  expect(screen.getByText("Queues")).toBeInTheDocument();
  expect(screen.getByText("Servers")).toBeInTheDocument();
  expect(screen.getByText("Schedulers")).toBeInTheDocument();
  expect(screen.getByText("Redis")).toBeInTheDocument();
  expect(screen.getByText("Settings")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Send Feedback" })).toHaveAttribute(
    "href",
    "https://github.com/pars-aria-labs/asynqmon/issues"
  );
});
