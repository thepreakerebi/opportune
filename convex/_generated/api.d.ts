/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as functions_agents_tools from "../functions/agents/tools.js";
import type * as functions_agents_workflows from "../functions/agents/workflows.js";
import type * as functions_alerts from "../functions/alerts.js";
import type * as functions_applications from "../functions/applications.js";
import type * as functions_auth from "../functions/auth.js";
import type * as functions_documents from "../functions/documents.js";
import type * as functions_embeddings from "../functions/embeddings.js";
import type * as functions_firecrawl from "../functions/firecrawl.js";
import type * as functions_firecrawlMutations from "../functions/firecrawlMutations.js";
import type * as functions_matching from "../functions/matching.js";
import type * as functions_opportunities from "../functions/opportunities.js";
import type * as functions_semanticSearch from "../functions/semanticSearch.js";
import type * as functions_users from "../functions/users.js";
import type * as functions_validation from "../functions/validation.js";
import type * as myFunctions from "../myFunctions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "functions/agents/tools": typeof functions_agents_tools;
  "functions/agents/workflows": typeof functions_agents_workflows;
  "functions/alerts": typeof functions_alerts;
  "functions/applications": typeof functions_applications;
  "functions/auth": typeof functions_auth;
  "functions/documents": typeof functions_documents;
  "functions/embeddings": typeof functions_embeddings;
  "functions/firecrawl": typeof functions_firecrawl;
  "functions/firecrawlMutations": typeof functions_firecrawlMutations;
  "functions/matching": typeof functions_matching;
  "functions/opportunities": typeof functions_opportunities;
  "functions/semanticSearch": typeof functions_semanticSearch;
  "functions/users": typeof functions_users;
  "functions/validation": typeof functions_validation;
  myFunctions: typeof myFunctions;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
