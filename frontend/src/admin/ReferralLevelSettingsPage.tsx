import {
  Box,
  Button,
  FormControlLabel,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { List, Title } from "react-admin";
import { getAdminApiUrl } from "../backendOrigin";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

type LevelRow = { level: number; percentOfStake: number; enabled: boolean };

type Payload = { referralProgramEnabled: boolean; levels: LevelRow[] };

function fractionToPercentInput(f: number): string {
  return (Number(f) * 100).toFixed(4).replace(/\.?0+$/, "");
}

function parsePercentInput(s: string): number {
  const n = Number(String(s).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n / 100;
}

async function adminFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(ADMIN_TOKEN_LS_KEY) ?? "";
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string>)
    }
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    throw new Error(typeof data.message === "string" ? data.message : res.statusText);
  }
  return data as T;
}

export function ReferralLevelSettingsPage() {
  const [master, setMaster] = useState(true);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [percentStr, setPercentStr] = useState<Record<number, string>>({});
  const [enabledMap, setEnabledMap] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const p = await adminFetchJson<Payload>(getAdminApiUrl("admin/referral-level-settings"));
      setMaster(p.referralProgramEnabled);
      setLevels(p.levels);
      const ps: Record<number, string> = {};
      const em: Record<number, boolean> = {};
      for (const L of p.levels) {
        ps[L.level] = fractionToPercentInput(L.percentOfStake);
        em[L.level] = L.enabled;
      }
      setPercentStr(ps);
      setEnabledMap(em);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const body: Payload = {
        referralProgramEnabled: master,
        levels: levels.map((L) => ({
          level: L.level,
          percentOfStake: parsePercentInput(percentStr[L.level] ?? "0"),
          enabled: Boolean(enabledMap[L.level])
        }))
      };
      const p = await adminFetchJson<Payload>(getAdminApiUrl("admin/referral-level-settings"), {
        method: "PUT",
        body: JSON.stringify(body)
      });
      setMaster(p.referralProgramEnabled);
      setLevels(p.levels);
      setSaved("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }, [master, levels, percentStr, enabledMap]);

  return (
    <List resource="referral_level_settings" actions={false} pagination={false} perPage={50}>
      <Title title="Referral level income" />
      <Paper sx={{ p: 2, maxWidth: 800 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Each live binary bet pays upline levels a <strong>percent of stake</strong> (stored as fraction, e.g.{" "}
          <code>0.001</code> = 0.1%). Turn off the master switch to stop all level payouts. Per-level toggles and
          rates apply when the program is on.
        </Typography>

        <FormControlLabel
          control={
            <Switch checked={master} onChange={(_, v) => setMaster(v)} disabled={busy} />
          }
          label="Referral / level income program enabled"
        />

        {error ? (
          <Typography color="error" sx={{ my: 1 }}>
            {error}
          </Typography>
        ) : null}
        {saved ? (
          <Typography color="primary" sx={{ my: 1 }}>
            {saved}
          </Typography>
        ) : null}

        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Level</TableCell>
              <TableCell>% of stake (per bet)</TableCell>
              <TableCell>On</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {levels.map((L) => (
              <TableRow key={L.level}>
                <TableCell>L{L.level}</TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={percentStr[L.level] ?? ""}
                    onChange={(e) => setPercentStr((s) => ({ ...s, [L.level]: e.target.value }))}
                    disabled={busy}
                    inputProps={{ inputMode: "decimal" }}
                    placeholder="0.1"
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={Boolean(enabledMap[L.level])}
                    onChange={(_, v) => setEnabledMap((m) => ({ ...m, [L.level]: v }))}
                    disabled={busy}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
          <Button variant="contained" onClick={() => void save()} disabled={busy}>
            Save
          </Button>
          <Button variant="outlined" onClick={() => void load()} disabled={busy}>
            Reload
          </Button>
        </Box>
      </Paper>
    </List>
  );
}
