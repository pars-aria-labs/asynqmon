import { Dispatch } from "redux";
import { listGroups, ListGroupsResponse } from "../api";
import { toErrorString, toErrorStringWithHttpStatus } from "../utils";

// List of groups related action types.
export const LIST_GROUPS_BEGIN = "LIST_GROUPS_BEGIN";
export const LIST_GROUPS_SUCCESS = "LIST_GROUPS_SUCCESS";
export const LIST_GROUPS_ERROR = "LIST_GROUPS_ERROR";

interface ListGroupsBeginAction {
  type: typeof LIST_GROUPS_BEGIN;
  queue: string;
}

interface ListGroupsSuccessAction {
  type: typeof LIST_GROUPS_SUCCESS;
  payload: ListGroupsResponse;
  queue: string;
}

interface ListGroupsErrorAction {
  type: typeof LIST_GROUPS_ERROR;
  queue: string;
  error: string;
}

// Union of all groups related action types.
export type GroupsActionTypes =
  | ListGroupsBeginAction
  | ListGroupsSuccessAction
  | ListGroupsErrorAction;

export function listGroupsAsync(qname: string, signal?: AbortSignal) {
  return async (dispatch: Dispatch<GroupsActionTypes>) => {
    dispatch({ type: LIST_GROUPS_BEGIN, queue: qname });
    try {
      const response = await listGroups(qname, signal);
      if (signal?.aborted) return;
      dispatch({
        type: LIST_GROUPS_SUCCESS,
        payload: response,
        queue: qname,
      });
    } catch (error) {
      if (signal?.aborted) return;
      console.error(`listGroupsAsync: ${toErrorStringWithHttpStatus(error)}`);
      dispatch({
        type: LIST_GROUPS_ERROR,
        error: toErrorString(error),
        queue: qname,
      });
    }
  };
}
