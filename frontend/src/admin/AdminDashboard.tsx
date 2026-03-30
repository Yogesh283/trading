import BlockIcon from "@mui/icons-material/Block";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Title } from "react-admin";
import { useNavigate } from "react-router-dom";
import { getAdminApiUrl } from "../backendOrigin";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

function fmtUsdt(v: unknown): string {
  const n = v == null ? 0 : typeof v === "number" ? v : Number(v);
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)} USDT`;
}

type Stats = {
  usersCount: number;
  pendingDepositReviewCount: number;
  pendingDepositReviewUsdt: number;
  pendingWithdrawalsCount: number;
  totalLiveWalletInr: number;
  totalDemoWalletInr: number;
  investorsWithPrincipal: number;
  totalInvestmentPrincipalInr: number;
  usersLoggedInTodayUtc: number;
  usersLoggedInTodayUtcDate: string;
  usersLoggedInTodayUtcIds?: string[];
  usersLoggedInTodayUtcIdsTruncated?: boolean;
  totalDepositsCreditedUsdt?: number;
  todayDepositsCreditedUsdt?: number;
  totalWithdrawalsCompletedUsdt?: number;
  todayWithdrawalsCompletedUsdt?: number;
  todayCompanyBinaryGrossInr?: number;
  todayCompanyReferralCostInr?: number;
  todayCompanyNetProfitInr?: number;
  withdrawalsLast7Days?: Array<{
    date: string;
    submittedCount: number;
    submittedUsdt: number;
    completedCount: number;
    completedUsdt: number;
  }>;
  database?: { kind: string; database?: string; file?: string };
};

function StatCard({
  title,
  value,
  subtitle,
  onNavigate
}: {
  title: string;
  value: string;
  subtitle?: string;
  /** Opens the related admin list when set */
  onNavigate?: () => void;
}) {
  const clickable = typeof onNavigate === "function";
  return (
    <Card
      variant="outlined"
      onClick={clickable ? onNavigate : undefined}
      sx={{
        height: "100%",
        bgcolor: "background.paper",
        cursor: clickable ? "pointer" : "default",
        transition: "box-shadow 0.2s, border-color 0.2s",
        ...(clickable
          ? {
              "&:hover": {
                borderColor: "primary.main",
                boxShadow: 2
              }
            }
          : {})
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onNavigate?.();
              }
            }
          : undefined
      }
    >
      <CardContent>
        <Typography color="text.secondary" variant="body2" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
          {value}
        </Typography>
        {subtitle ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockUserId, setBlockUserId] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  const goList = useCallback(
    (resource: string, filter?: Record<string, unknown>) => {
      const path = `/${resource}`;
      const q =
        filter && Object.keys(filter).length > 0
          ? `?filter=${encodeURIComponent(JSON.stringify(filter))}`
          : "";
      navigate(`${path}${q}`);
    },
    [navigate]
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const token = localStorage.getItem(ADMIN_TOKEN_LS_KEY) ?? "";
    try {
      const res = await fetch(getAdminApiUrl("admin/dashboard-stats"), {
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(j?.message ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as Stats;
      setStats(j);
    } catch (e) {
      setStats(null);
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postBlock = useCallback(
    async (blocked: boolean) => {
      setBlockMsg(null);
      const uid = blockUserId.trim();
      if (!uid) {
        setBlockMsg("Enter a user ID (copy from the Users list).");
        return;
      }
      const token = localStorage.getItem(ADMIN_TOKEN_LS_KEY) ?? "";
      setBlockBusy(true);
      try {
        const res = await fetch(getAdminApiUrl("admin/user-block"), {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ userId: uid, blocked })
        });
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) {
          throw new Error(j?.message ?? `HTTP ${res.status}`);
        }
        setBlockMsg(blocked ? `User ${uid} blocked.` : `User ${uid} unblocked.`);
        void load();
      } catch (e) {
        setBlockMsg(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBlockBusy(false);
      }
    },
    [blockUserId, load]
  );

  return (
    <Box sx={{ p: 2 }}>
      <Title title="Dashboard" />
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Typography variant="h5" component="h1">
          Overview
        </Typography>
        <Button
          startIcon={<RefreshIcon />}
          size="small"
          variant="outlined"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
      </Stack>

      {error ? (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      ) : null}

      {loading && !stats ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : stats ? (
        <>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Registered users"
              value={String(stats.usersCount)}
              onNavigate={() => goList("users")}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Logins today (UTC)"
              value={String(stats.usersLoggedInTodayUtc ?? 0)}
              subtitle={`Window: ${stats.usersLoggedInTodayUtcDate ?? "—"} · successful app logins · see user IDs below`}
              onNavigate={() => goList("user_insights")}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Deposits awaiting review"
              value={String(stats.pendingDepositReviewCount)}
              subtitle={
                stats.pendingDepositReviewUsdt > 0
                  ? `~${stats.pendingDepositReviewUsdt.toFixed(2)} USDT pending`
                  : undefined
              }
              onNavigate={() => goList("deposits", { status: "pending_review" })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Withdrawals (pending / processing)"
              value={String(stats.pendingWithdrawalsCount)}
              onNavigate={() => goList("withdrawals", { status_pending_processing: true })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Total live wallet (INR)"
              value={`₹${stats.totalLiveWalletInr.toFixed(2)}`}
              subtitle="Sum of all users’ live balances"
              onNavigate={() => goList("wallets")}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Total demo wallet (INR)"
              value={`₹${stats.totalDemoWalletInr.toFixed(2)}`}
              subtitle="Sum of demo balances"
              onNavigate={() => goList("wallets")}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Active investments"
              value={String(stats.investorsWithPrincipal)}
              subtitle={`Principal total ₹${stats.totalInvestmentPrincipalInr.toFixed(2)}`}
              onNavigate={() => goList("user_investments")}
            />
          </Grid>
        </Grid>

        <Paper variant="outlined" sx={{ p: 2, mt: 2, maxWidth: 960, bgcolor: "background.paper" }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Today&apos;s logged-in user IDs (UTC · {stats.usersLoggedInTodayUtcDate ?? "—"})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Total <strong>{stats.usersLoggedInTodayUtc ?? 0}</strong> users · order: newest login first
            {stats.usersLoggedInTodayUtcIdsTruncated
              ? ` · listing first ${(stats.usersLoggedInTodayUtcIds ?? []).length} IDs`
              : null}
          </Typography>
          {(stats.usersLoggedInTodayUtcIds ?? []).length === 0 ? (
            <Typography color="text.secondary">No logins for this UTC day yet.</Typography>
          ) : (
            <Stack direction="row" flexWrap="wrap" gap={0.75} useFlexGap>
              {(stats.usersLoggedInTodayUtcIds ?? []).map((id) => (
                <Chip key={id} label={id} size="small" variant="outlined" />
              ))}
            </Stack>
          )}
        </Paper>

        <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3, mb: 1 }}>
          Company overview (UTC · {stats.usersLoggedInTodayUtcDate ?? "—"})
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Deposits: credited USDT only. Withdrawals: completed USDT only (paid out). Profit: live binary settles today minus
          referral payouts (level income). Not full accounting — excludes investment yield, fees, etc.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Total deposits credited"
              value={fmtUsdt(stats.totalDepositsCreditedUsdt)}
              subtitle="All-time, status credited"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Today deposits credited"
              value={fmtUsdt(stats.todayDepositsCreditedUsdt)}
              subtitle="By deposit updated_at (UTC day)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Total withdrawals completed"
              value={fmtUsdt(stats.totalWithdrawalsCompletedUsdt)}
              subtitle="All-time, status completed"
              onNavigate={() => goList("withdrawals")}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Today withdrawals completed"
              value={fmtUsdt(stats.todayWithdrawalsCompletedUsdt)}
              subtitle="By withdrawal updated_at (UTC day)"
              onNavigate={() => goList("withdrawals")}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Today binary gross (INR)"
              value={`₹${(stats.todayCompanyBinaryGrossInr ?? 0).toFixed(2)}`}
              subtitle="Stake kept − win payouts, settled today"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Today referral paid (INR)"
              value={`₹${(stats.todayCompanyReferralCostInr ?? 0).toFixed(2)}`}
              subtitle="level_income + level_income_staking"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Today net (estimate)"
              value={`₹${(stats.todayCompanyNetProfitInr ?? 0).toFixed(2)}`}
              subtitle="Binary gross − referral"
            />
          </Grid>
        </Grid>

        <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3, mb: 1 }}>
          Withdrawal report (last 7 UTC days)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Submitted: requests created that day. Completed: marked completed that day (amount = USDT). Open the{" "}
          <Button size="small" variant="text" sx={{ p: 0, minWidth: 0 }} onClick={() => goList("withdrawals")}>
            Withdrawals
          </Button>{" "}
          list for detail.
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: 720, mb: 1 }}>
          <Table size="small" aria-label="Withdrawals by UTC calendar day">
            <TableHead>
              <TableRow>
                <TableCell>Date (UTC)</TableCell>
                <TableCell align="right">Submitted #</TableCell>
                <TableCell align="right">Submitted USDT</TableCell>
                <TableCell align="right">Completed #</TableCell>
                <TableCell align="right">Completed USDT</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(stats.withdrawalsLast7Days ?? []).map((row) => (
                <TableRow key={row.date}>
                  <TableCell component="th" scope="row">
                    {row.date}
                  </TableCell>
                  <TableCell align="right">{row.submittedCount}</TableCell>
                  <TableCell align="right">{row.submittedUsdt.toFixed(2)}</TableCell>
                  <TableCell align="right">{row.completedCount}</TableCell>
                  <TableCell align="right">{row.completedUsdt.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        </>
      ) : null}

      <Card variant="outlined" sx={{ mt: 3, maxWidth: 520, bgcolor: "background.paper" }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <BlockIcon color="warning" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={600}>
              User block / unblock
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Enter the user ID (e.g. <code>0001</code>) — copy it from the Users list. A blocked user cannot sign in; existing
            JWTs will stop working.
          </Typography>
          <TextField
            size="small"
            label="User ID"
            value={blockUserId}
            onChange={(e) => setBlockUserId(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            autoComplete="off"
          />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              color="warning"
              disabled={blockBusy}
              onClick={() => void postBlock(true)}
            >
              Block
            </Button>
            <Button variant="outlined" disabled={blockBusy} onClick={() => void postBlock(false)}>
              Unblock
            </Button>
          </Stack>
          {blockMsg ? (
            <Typography
              variant="body2"
              sx={{ mt: 1 }}
              color={/^User \S+ (blocked|unblocked)\.$/.test(blockMsg) ? "success.main" : "error"}
            >
              {blockMsg}
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      {stats?.database ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
          Data source:{" "}
          {stats.database.kind === "mysql"
            ? `MySQL · ${stats.database.database ?? "?"}`
            : stats.database.kind === "sqlite"
              ? `SQLite · ${stats.database.file ?? "data/app.db"}`
              : stats.database.kind}
        </Typography>
      ) : null}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        Use the menu for full lists (Deposits, Withdrawals, Users, Wallets, Transactions, User insights).
      </Typography>
    </Box>
  );
}
