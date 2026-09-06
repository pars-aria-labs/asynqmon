import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MetricsFetchControls } from "./MetricsFetchControls";

const baseProps = {
  onEndTimeChange: vi.fn(),
  onDurationChange: vi.fn(),
  queues: [],
  selectedQueues: [],
  addQueue: vi.fn(),
  removeQueue: vi.fn(),
};

test("synchronizes fixed time and duration when URL-backed props change", () => {
  const now = 1_800_000_000;
  const { rerender } = render(
    <MetricsFetchControls
      {...baseProps}
      endTimeSec={now}
      isEndTimeFixed={false}
      durationSec={60 * 60}
    />,
  );
  expect(screen.getByRole("button", { name: "Realtime: 1h" })).toBeVisible();

  // A fixed timestamp can equal "now" after choosing Freeze at now. The URL
  // flag, rather than timestamp proximity, must make this historical.
  rerender(
    <MetricsFetchControls
      {...baseProps}
      endTimeSec={now}
      isEndTimeFixed={true}
      durationSec={8 * 24 * 60 * 60}
    />,
  );
  expect(screen.getByRole("button", { name: "Historical: 8d" })).toBeVisible();

  rerender(
    <MetricsFetchControls
      {...baseProps}
      endTimeSec={now + 10}
      isEndTimeFixed={false}
      durationSec={6 * 60 * 60}
    />,
  );
  expect(screen.getByRole("button", { name: "Realtime: 6h" })).toBeVisible();
});

test("a realtime display update does not erase a custom duration being edited", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <MetricsFetchControls
      {...baseProps}
      endTimeSec={1_800_000_000}
      isEndTimeFixed={false}
      durationSec={60 * 60}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Realtime: 1h" }));
  await user.click(screen.getByRole("radio", { name: "Custom Duration" }));
  await user.type(screen.getByRole("textbox", { name: "duration" }), "90m");

  rerender(
    <MetricsFetchControls
      {...baseProps}
      endTimeSec={1_800_000_008}
      isEndTimeFixed={false}
      durationSec={60 * 60}
    />,
  );
  expect(screen.getByRole("textbox", { name: "duration" })).toHaveValue(
    "90m",
  );
});

test("a realtime tick preserves a custom end-time draft", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <MetricsFetchControls
      {...baseProps}
      endTimeSec={1_800_000_000}
      isEndTimeFixed={false}
      durationSec={60 * 60}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Realtime: 1h" }));
  await user.click(screen.getByRole("radio", { name: "Custom End Time" }));
  const input = screen.getByRole("textbox", {
    name: "yyyy-mm-dd hh:mm:ssz",
  });
  await user.type(input, "2026-09-06 12:34:56Z");

  rerender(
    <MetricsFetchControls
      {...baseProps}
      endTimeSec={1_800_000_008}
      isEndTimeFixed={false}
      durationSec={60 * 60}
    />,
  );

  expect(screen.getByRole("radio", { name: "Custom End Time" })).toBeChecked();
  expect(input).toHaveValue("2026-09-06 12:34:56Z");
});

test("rejects custom durations that the metrics API cannot serve", async () => {
  const user = userEvent.setup();
  const onDurationChange = vi.fn();
  render(
    <MetricsFetchControls
      {...baseProps}
      onDurationChange={onDurationChange}
      endTimeSec={1_800_000_000}
      isEndTimeFixed={false}
      durationSec={60 * 60}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Realtime: 1h" }));
  await user.click(screen.getByRole("radio", { name: "Custom Duration" }));
  const input = screen.getByRole("textbox", { name: "duration" });

  await user.type(input, "744h{Enter}");
  expect(screen.getByText("Use a duration from 1s to 30d")).toBeVisible();
  expect(onDurationChange).not.toHaveBeenCalled();
});
