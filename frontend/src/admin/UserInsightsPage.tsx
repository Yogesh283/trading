import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { useCallback, useState } from "react";
import { List, Title } from "react-admin";
import { getAdminApiUrl } from "../backendOrigin";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

function formatInr(n: number) {
  return `₹${Number(n).toFixed(2)}`;
}

type SearchMatch = { id: string; name: string; email: string };

type InsightsPayload = {
  user: {
    id: string;
    name: string;
    email: string;
    created_at: string;
    role: string;
    self_referral_code: string | null;
    referral_code: string | null;
    balance: number;
    demo_balance: number;
    inviter_id: string | null;
    inviter_name: string | null;
    inviter_email: string | null;
    direct_team_count: number;
    total_team_count: number;
  };
  deposits: {
    totalCreditedUsdt: number;
    countCredited: number;
    recent: { id: string; amount: number; status: string; created_at: string }[];
  };
  withdrawals: {
    byStatus: { status: string; totalUsdt: number; count: number }[];
    recent: { id: string; amount: number; status: string; created_at: string }[];
  };
  ledger: {
    byType: { txn_type: string; total: number; count: number }[];
    binaryNetInr: number;
    totalLevelIncomeInr: number;
    totalBinaryWinsInr: number;
    totalBinaryStakesInr: number;
    recent: {
      id: string;
      txn_type: string;
      amount: number;
      reference_id: string | null;
      created_at: string;
    }[];
  };
};

async function adminJson<T>(path: string): Promise<T> {
  const token = localStorage.getItem(ADMIN_TOKEN_LS_KEY) ?? "";
  const res = await fetch(getAdminApiUrl(path), {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    throw new Error(typeof data.message === "string" ? data.message : res.statusText);
  }
  return data as T;
}

export function UserInsightsPage() {
  const [userId, setUserId] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadById = useCallback(async (id: string) => {
    const uid = id.trim();
    if (!uid) return;
    setBusy(true);
    setError(null);
    setMatches([]);
    try {
      const j = await adminJson<InsightsPayload>(
        `admin/user-insights?userId=${encodeURIComponent(uid)}`
      );
      setData(j);
      setUserId(j.user.id);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const runSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (q.length < 1) return;
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const j = await adminJson<{ matches: SearchMatch[] }>(
        `admin/user-insights?search=${encodeURIComponent(q)}`
      );
      setMatches(j.matches ?? []);
      if (!j.matches?.length) {
        setError("No users matched.");
      }
    } catch (e) {
      setMatches([]);
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }, [searchQ]);

  return (
    <List resource="user_insights" actions={false} pagination={false} perPage={100}>
      <Title title="User insights" />
      <Paper sx={{ p: 2, maxWidth: 1200 }}>
        <Typography variant="h6" gutterBottom>
          Search by user ID, or name / email
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end", mb: 2 }}>
          <TextField
            label="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            size="small"
            sx={{ minWidth: 280 }}
          />
          <Button variant="contained" disabled={busy} onClick={() => void loadById(userId)}>
            Load details
          </Button>
          <TextField
            label="Name or email contains"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            size="small"
            sx={{ minWidth: 240 }}
          />
          <Button variant="outlined" disabled={busy} onClick={() => void runSearch()}>
            Search users
          </Button>
        </Box>

        {error ? (
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        ) : null}

        {matches.length > 0 ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Matches — click to open
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {matches.map((m) => (
                <Button
                  key={m.id}
                  size="small"
                  variant="text"
                  sx={{ justifyContent: "flex-start", textTransform: "none" }}
                  onClick={() => void loadById(m.id)}
                >
                  {m.name} · {m.email} · <code>{m.id}</code>
                </Button>
              ))}
            </Box>
          </Box>
        ) : null}

        {data ? (
          <>
            <Typography variant="h6" sx={{ mt: 2 }}>
              Profile
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableBody>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>
                    <code>{data.user.id}</code>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>{data.user.name}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>{data.user.email}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Role</TableCell>
                  <TableCell>{data.user.role}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Created</TableCell>
                  <TableCell>{data.user.created_at}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Live wallet (INR)</TableCell>
                  <TableCell>{formatInr(data.user.balance)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Demo wallet (INR)</TableCell>
                  <TableCell>{formatInr(data.user.demo_balance)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Self referral code</TableCell>
                  <TableCell>{data.user.self_referral_code ?? "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Signed up with ref code</TableCell>
                  <TableCell>{data.user.referral_code ?? "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Inviter</TableCell>
                  <TableCell>
                    {data.user.inviter_name
                      ? `${data.user.inviter_name} (${data.user.inviter_email})`
                      : "—"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Team</TableCell>
                  <TableCell>
                    Direct {data.user.direct_team_count} · Total downline {data.user.total_team_count}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Typography variant="h6">Deposits (USDT)</Typography>
            <Typography>
              Credited total: <strong>{data.deposits.totalCreditedUsdt.toFixed(4)}</strong> USDT ·{" "}
              {data.deposits.countCredited} deposits
            </Typography>
            <Table size="small" sx={{ my: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>USDT</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.deposits.recent.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.created_at}</TableCell>
                    <TableCell>{d.amount}</TableCell>
                    <TableCell>{d.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="h6">Withdrawals (USDT)</Typography>
            <Table size="small" sx={{ my: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell>Total USDT</TableCell>
                  <TableCell>Count</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.withdrawals.byStatus.map((w) => (
                  <TableRow key={w.status}>
                    <TableCell>{w.status}</TableCell>
                    <TableCell>{w.totalUsdt.toFixed(4)}</TableCell>
                    <TableCell>{w.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>USDT</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.withdrawals.recent.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>{w.created_at}</TableCell>
                    <TableCell>{w.amount}</TableCell>
                    <TableCell>{w.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="h6">Income &amp; ledger (live wallet · INR)</Typography>
            <Typography sx={{ mb: 1 }}>
              <strong>Level income (referral):</strong> {formatInr(data.ledger.totalLevelIncomeInr)} ·{" "}
              <strong>Binary wins credited:</strong> {formatInr(data.ledger.totalBinaryWinsInr)} ·{" "}
              <strong>Binary stakes (debits):</strong> {formatInr(data.ledger.totalBinaryStakesInr)} ·{" "}
              <strong>Net binary P&amp;L (sum of binary_* rows):</strong>{" "}
              {formatInr(data.ledger.binaryNetInr)}
            </Typography>

            <Typography variant="subtitle2">Totals by transaction type</Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Sum (INR)</TableCell>
                  <TableCell align="right">Count</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...data.ledger.byType]
                  .sort((a, b) => a.txn_type.localeCompare(b.txn_type))
                  .map((r) => (
                    <TableRow key={r.txn_type}>
                      <TableCell>
                        <code>{r.txn_type}</code>
                      </TableCell>
                      <TableCell align="right">{formatInr(r.total)}</TableCell>
                      <TableCell align="right">{r.count}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>

            <Typography variant="subtitle2">Recent ledger rows</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Ref</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.ledger.recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.created_at}</TableCell>
                    <TableCell>
                      <code>{r.txn_type}</code>
                    </TableCell>
                    <TableCell align="right">{formatInr(r.amount)}</TableCell>
                    <TableCell>
                      <code>{r.reference_id ?? "—"}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : null}
      </Paper>
    </List>
  );
}
