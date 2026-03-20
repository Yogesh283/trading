import simpleRestProvider from "ra-data-simple-rest";
import type { DataProvider, GetOneParams } from "react-admin";
import { fetchUtils } from "react-admin";
import { getBackendHttpOriginLocalAdmin } from "../backendOrigin";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

const httpClient = (url: string, options: fetchUtils.Options = {}) => {
  const token = localStorage.getItem(ADMIN_TOKEN_LS_KEY) ?? "";
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetchUtils.fetchJson(url, { ...options, headers });
};

/** Localhost = relative /api (local DB). Live = full origin if VITE_API_URL set at build. */
const adminApiRoot = (): string => {
  const base = getBackendHttpOriginLocalAdmin().replace(/\/$/, "");
  return base ? `${base}/api/admin/ra` : "/api/admin/ra";
};

/**
 * ra-data-simple-rest v5 defaults to Content-Range; our API sends X-Total-Count (+ CORS expose).
 * Without this, getList throws "header is missing" and lists stay empty.
 */
const baseAdminDataProvider = simpleRestProvider(adminApiRoot(), httpClient, "X-Total-Count");

/** Edit click: id kabhi number/space aata hai — URL + server lookup stable rahe. */
export const adminDataProvider: DataProvider = {
  ...baseAdminDataProvider,
  getOne: async (resource: string, params: GetOneParams) => {
    const raw = params.id;
    const id =
      raw === undefined || raw === null
        ? ""
        : typeof raw === "number" || typeof raw === "bigint"
          ? String(raw)
          : String(raw).trim();
    if (!id) {
      throw new Error("Missing record id — list refresh karke dubara try karein.");
    }
    return baseAdminDataProvider.getOne(resource, { ...params, id });
  }
};
