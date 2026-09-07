import { vi } from "vitest";
import request from "./request";
import { getBulkProgress, performBulkAction } from "./bulkActions";

vi.mock("./request");

const mockedRequest = vi.mocked(request);

beforeEach(() => mockedRequest.mockReset());

describe("bulk operations", () => {
  it("caps work despite a growing remaining count", async () => {
    mockedRequest
      .mockResolvedValueOnce({
        data: { deleted: 500, remaining: 20 },
      } as any)
      .mockResolvedValueOnce({
        data: { deleted: 20, remaining: 5000 },
      } as any);

    await expect(performBulkAction("delete", "/tasks")).resolves.toBe(520);
    expect(
      mockedRequest.mock.calls.map(
        ([config]) => (config as any).params.batch_size
      )
    ).toEqual([500, 20]);
    expect(getBulkProgress()).toEqual([]);
  });

  it("supports an old server response without repeating a mutation", async () => {
    mockedRequest.mockResolvedValueOnce({ data: { scheduled: 1200 } } as any);

    await expect(performBulkAction("run", "/tasks")).resolves.toBe(1200);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failed batch and clears progress", async () => {
    mockedRequest
      .mockResolvedValueOnce({
        data: { archived: 500, remaining: 1 },
      } as any)
      .mockRejectedValueOnce(new Error("connection lost"));

    await expect(performBulkAction("archive", "/tasks")).rejects.toThrow(
      "500 confirmed tasks"
    );
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(getBulkProgress()).toEqual([]);
  });

  it("includes progress confirmed by a failed server response", async () => {
    mockedRequest
      .mockResolvedValueOnce({
        data: { archived: 500, remaining: 1 },
      } as any)
      .mockRejectedValueOnce(
        Object.assign(new Error("Request failed with status code 500"), {
          response: {
            status: 500,
            data: { error: "remaining count failed", processed: 1 },
          },
        })
      );

    await expect(performBulkAction("archive", "/tasks")).rejects.toThrow(
      "501 confirmed tasks"
    );
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(getBulkProgress()).toEqual([]);
  });

  it("preserves HTTP error details for existing action handlers", async () => {
    mockedRequest.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 405"), {
        response: {
          status: 405,
          statusText: "Method Not Allowed",
          data: "API Server is running in read-only mode",
        },
      })
    );

    await expect(performBulkAction("delete", "/tasks")).rejects.toMatchObject({
      response: {
        status: 405,
        data: expect.stringContaining("0 confirmed tasks"),
      },
    });
  });

  it("stops when concurrent consumers empty the queue", async () => {
    mockedRequest.mockResolvedValueOnce({
      data: { deleted: 0, remaining: 10 },
    } as any);

    await expect(performBulkAction("delete", "/tasks")).resolves.toBe(0);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed progress responses", async () => {
    mockedRequest.mockResolvedValueOnce({
      data: { deleted: 501, remaining: 1 },
    } as any);

    await expect(performBulkAction("delete", "/tasks")).rejects.toThrow(
      "Invalid bulk operation response"
    );
    expect(getBulkProgress()).toEqual([]);
  });
});
