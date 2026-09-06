import axios from "axios";
import { getBulkProgress, performBulkAction } from "./bulkActions";

jest.mock("axios");

const mockedAxios = axios as jest.MockedFunction<typeof axios>;

beforeEach(() => mockedAxios.mockReset());

describe("bulk operations", () => {
  it("caps work despite a growing remaining count", async () => {
    mockedAxios
      .mockResolvedValueOnce({
        data: { deleted: 500, remaining: 20 },
      } as any)
      .mockResolvedValueOnce({
        data: { deleted: 20, remaining: 5000 },
      } as any);

    await expect(performBulkAction("delete", "/tasks")).resolves.toBe(520);
    expect(
      mockedAxios.mock.calls.map(
        ([config]) => (config as any).params.batch_size
      )
    ).toEqual([500, 20]);
    expect(getBulkProgress()).toEqual([]);
  });

  it("supports an old server response without repeating a mutation", async () => {
    mockedAxios.mockResolvedValueOnce({ data: { scheduled: 1200 } } as any);

    await expect(performBulkAction("run", "/tasks")).resolves.toBe(1200);
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failed batch and clears progress", async () => {
    mockedAxios
      .mockResolvedValueOnce({
        data: { archived: 500, remaining: 1 },
      } as any)
      .mockRejectedValueOnce(new Error("connection lost"));

    await expect(performBulkAction("archive", "/tasks")).rejects.toThrow(
      "500 confirmed tasks"
    );
    expect(mockedAxios).toHaveBeenCalledTimes(2);
    expect(getBulkProgress()).toEqual([]);
  });

  it("includes progress confirmed by a failed server response", async () => {
    mockedAxios
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
    expect(mockedAxios).toHaveBeenCalledTimes(2);
    expect(getBulkProgress()).toEqual([]);
  });

  it("preserves HTTP error details for existing action handlers", async () => {
    mockedAxios.mockRejectedValueOnce(
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
    mockedAxios.mockResolvedValueOnce({
      data: { deleted: 0, remaining: 10 },
    } as any);

    await expect(performBulkAction("delete", "/tasks")).resolves.toBe(0);
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed progress responses", async () => {
    mockedAxios.mockResolvedValueOnce({
      data: { deleted: 501, remaining: 1 },
    } as any);

    await expect(performBulkAction("delete", "/tasks")).rejects.toThrow(
      "Invalid bulk operation response"
    );
    expect(getBulkProgress()).toEqual([]);
  });
});
