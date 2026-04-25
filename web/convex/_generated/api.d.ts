/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as holdings from "../holdings.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as moat from "../moat.js";
import type * as retirement from "../retirement.js";
import type * as snapshots from "../snapshots.js";
import type * as statements from "../statements.js";
import type * as tickers from "../tickers.js";
import type * as twr from "../twr.js";
import type * as users from "../users.js";
import type * as valuation from "../valuation.js";
import type * as watchlist from "../watchlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  holdings: typeof holdings;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  moat: typeof moat;
  retirement: typeof retirement;
  snapshots: typeof snapshots;
  statements: typeof statements;
  tickers: typeof tickers;
  twr: typeof twr;
  users: typeof users;
  valuation: typeof valuation;
  watchlist: typeof watchlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
