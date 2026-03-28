import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { List, Title } from "react-admin";
import { getAdminApiUrl } from "../backendOrigin";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

type Row = {
  rootUserId: string;
  rootName: string;
  rootEmail: string;
  rootMobile: string;
  selfReferralCode: string;
  teamMembers: number;
  totalDepositsUsdt: number;
};

async function loadReport(): Promise<Row[]> {
  const token = localStorage.getItem(ADMIN_TOKEN_LS_KEY) ?? "";
  const res = await fetch(getAdminApiUrl("admin/team-business-report"), {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const j = (await res.json().catch(() => ({}))) as { message?: string; rows?: Row[] };
  if (!res.ok) {
    throw new Error(typeof j.message === "string" ? j.message : `HTTP ${res.status}`);
  }
  return j.rows ?? [];
}

export function TeamBusinessReportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await loadReport());
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <List pagination={false} actions={false} sx={{ "& .RaList-main": { boxShadow: "none" } }}>
      <Title title="Team business" />
      <Paper sx={{ p: 2, bgcolor: "background.paper" }}>
        <Typography variant="h6" gutterBottom>
          Team business (by tree root)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
          Each row is the <strong>top upline</strong> of one referral tree. <strong>Members</strong> counts everyone in
          that tree (including the root). <strong>Credited deposits</strong> is the sum of all credited USDT deposits
          from members of that tree.
        </Typography>
        {error ? (
          <Typography color="error">{error}</Typography>
        ) : loading ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Root user ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Mobile</TableCell>
                  <TableCell>Code</TableCell>
                  <TableCell align="right">Members</TableCell>
                  <TableCell align="right">Credited deposits (USDT)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography color="text.secondary">No users yet.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.rootUserId}>
                      <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{r.rootUserId}</TableCell>
                      <TableCell>{r.rootName}</TableCell>
                      <TableCell sx={{ wordBreak: "break-all", maxWidth: 220 }}>{r.rootEmail}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{r.rootMobile}</TableCell>
                      <TableCell>
                        <code>{r.selfReferralCode}</code>
                      </TableCell>
                      <TableCell align="right">{r.teamMembers}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {r.totalDepositsUsdt.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </List>
  );
}
