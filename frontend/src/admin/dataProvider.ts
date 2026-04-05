import simpleRestProvider from "ra-data-simple-rest";
import type { DataProvider, GetListParams, GetListResult, GetOneParams, GetOneResult, RaRecord } from "react-admin";
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

/** Custom admin pages (no React-Admin REST list backend). */
const STUB_LIST_RESOURCES = new Set(["user_insights", "team_business", "referral_level_settings"]);

/** Normalize id on edit (may arrive as number/with spaces) so URL + server stay consistent. */
export const adminDataProvider: DataProvider = {
  ...baseAdminDataProvider,
  getList: async <RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetListParams & { meta?: Record<string, unknown> }
  ): Promise<GetListResult<RecordType>> => {
    if (STUB_LIST_RESOURCES.has(resource)) {
      return { data: [{ id: "panel" }] as RecordType[], total: 1 };
    }
    return baseAdminDataProvider.getList<RecordType>(resource, params);
  },
  getOne: async <RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetOneParams<RecordType>
  ): Promise<GetOneResult<RecordType>> => {
    const raw = params.id;
    const id =
      raw === undefined || raw === null
        ? ""
        : typeof raw === "number" || typeof raw === "bigint"
          ? String(raw)
          : String(raw).trim();
    if (!id) {
      throw new Error("Missing record id — refresh the list and try again.");
    }
    if (STUB_LIST_RESOURCES.has(resource)) {
      return { data: { id } as RecordType };
    }
    return baseAdminDataProvider.getOne<RecordType>(resource, { ...params, id });
  }
};
