import BlockIcon from "@mui/icons-material/Block";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Title } from "react-admin";
import { useNavigate } from "react-router-dom";
import { getAdminApiUrl } from "../backendOrigin";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

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
  totalDepositsCreditedUsdt?: number;
  todayDepositsCreditedUsdt?: number;
  todayCompanyBinaryGrossInr?: number;
  todayCompanyReferralCostInr?: number;
  todayCompanyNetProfitInr?: number;
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
              subtitle={`Window: ${stats.usersLoggedInTodayUtcDate ?? "—"} · successful app logins only`}
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

        <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3, mb: 1 }}>
          Company overview (UTC · {stats.usersLoggedInTodayUtcDate ?? "—"})
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Deposits: credited USDT only. Profit: live binary settles today minus referral payouts (level income). Not full
          accounting — excludes withdrawals, investment yield, fees.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Total deposits credited"
              value={`${(stats.totalDepositsCreditedUsdt ?? 0).toFixed(2)} USDT`}
              subtitle="All-time, status credited"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Today deposits credited"
              value={`${(stats.todayDepositsCreditedUsdt ?? 0).toFixed(2)} USDT`}
              subtitle="By deposit updated_at (UTC day)"
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
