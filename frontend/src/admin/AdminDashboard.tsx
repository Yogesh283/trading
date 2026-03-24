import RefreshIcon from "@mui/icons-material/Refresh";
import { Box, Button, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Title } from "react-admin";
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
  database?: { kind: string; database?: string; file?: string };
};

function StatCard({
  title,
  value,
  subtitle
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card variant="outlined" sx={{ height: "100%", bgcolor: "background.paper" }}>
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard title="Registered users" value={String(stats.usersCount)} />
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
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Withdrawals (pending / processing)"
              value={String(stats.pendingWithdrawalsCount)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Total live wallet (INR)"
              value={`₹${stats.totalLiveWalletInr.toFixed(2)}`}
              subtitle="Sum of all users’ live balances"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Total demo wallet (INR)"
              value={`₹${stats.totalDemoWalletInr.toFixed(2)}`}
              subtitle="Sum of demo balances"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Active investments"
              value={String(stats.investorsWithPrincipal)}
              subtitle={`Principal total ₹${stats.totalInvestmentPrincipalInr.toFixed(2)}`}
            />
          </Grid>
        </Grid>
      ) : null}

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
