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
import { useCallback, useEffect, useMemo, useState } from "react";
import { List, Title } from "react-admin";
import { getAdminApiUrl } from "../backendOrigin";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

type LevelRow = { level: number; percentOfGrossYield: number; enabled: boolean };

type Payload = {
  monthlyRoiFraction: number;
  monthlyRoiPercent: number;
  levels: LevelRow[];
  uplinePercentOfGrossSum: number;
  investorNetFractionOfGross: number;
};

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

export function InvestmentRoiSettingsPage() {
  const [percentStr, setPercentStr] = useState("10");
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [levelPercentStr, setLevelPercentStr] = useState<Record<number, string>>({});
  const [enabledMap, setEnabledMap] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const p = await adminFetchJson<Payload>(getAdminApiUrl("admin/investment-roi-settings"));
      setPercentStr(fractionToPercentInput(p.monthlyRoiFraction));
      setLevels(p.levels);
      const ps: Record<number, string> = {};
      const em: Record<number, boolean> = {};
      for (const L of p.levels) {
        ps[L.level] = fractionToPercentInput(L.percentOfGrossYield);
        em[L.level] = L.enabled;
      }
      setLevelPercentStr(ps);
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

  const previewSum = useMemo(() => {
    let s = 0;
    for (const L of levels) {
      if (enabledMap[L.level]) {
        s += parsePercentInput(levelPercentStr[L.level] ?? "0");
      }
    }
    return s;
  }, [levels, enabledMap, levelPercentStr]);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const frac = parsePercentInput(percentStr);
      if (frac > 1) {
        throw new Error("Max 100% monthly ROI on principal");
      }
      const bodyLevels: LevelRow[] = levels.map((L) => ({
        level: L.level,
        percentOfGrossYield: parsePercentInput(levelPercentStr[L.level] ?? "0"),
        enabled: Boolean(enabledMap[L.level])
      }));
      await adminFetchJson<Payload>(getAdminApiUrl("admin/investment-roi-settings"), {
        method: "PUT",
        body: JSON.stringify({ monthlyRoiFraction: frac, levels: bodyLevels })
      });
      setSaved("Saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }, [percentStr, levels, levelPercentStr, enabledMap, load]);

  return (
    <List
      resource="investment_roi_settings"
      title="Investment ROI"
      actions={false}
      sx={{ "& .RaList-main": { mt: 0 } }}
    >
      <Title title="Investment monthly ROI" />
      <Paper sx={{ p: 2, maxWidth: 720, bgcolor: "background.paper" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Each month on the <strong>1st (UTC)</strong>, gross pool = principal × monthly ROI %. From this pool you can assign
          separate percentages to <strong>5 upline levels</strong> (table below). The investor is credited the remainder as{" "}
          <code>investment_yield</code>; uplines receive <code>level_income_roi</code>. This is separate from the referral /
          betting level table.
        </Typography>
        <TextField
          label="Monthly ROI (% of principal) — gross pool"
          value={percentStr}
          onChange={(e) => setPercentStr(e.target.value)}
          fullWidth
          size="small"
          helperText="Example: 10 = 10% of principal per month (gross before upline split)."
          disabled={busy}
          sx={{ mb: 2 }}
        />

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Upline share of <em>gross</em> monthly yield (levels 1 = direct inviter … 5)
        </Typography>
        <Table size="small" sx={{ mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Level</TableCell>
              <TableCell>% of gross pool</TableCell>
              <TableCell>On</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {levels.map((L) => (
              <TableRow key={L.level}>
                <TableCell>{L.level}</TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={levelPercentStr[L.level] ?? "0"}
                    onChange={(e) =>
                      setLevelPercentStr((prev) => ({
                        ...prev,
                        [L.level]: e.target.value
                      }))
                    }
                    disabled={busy}
                    inputProps={{ inputMode: "decimal" }}
                  />
                </TableCell>
                <TableCell>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(enabledMap[L.level])}
                        onChange={(_, v) =>
                          setEnabledMap((prev) => ({
                            ...prev,
                            [L.level]: v
                          }))
                        }
                        disabled={busy}
                      />
                    }
                    label=""
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Typography variant="body2" color={previewSum > 1 + 1e-6 ? "error" : "text.secondary"} sx={{ mb: 2 }}>
          Enabled upline total: {(previewSum * 100).toFixed(2)}% of gross (max 100%). Investor keeps approx{" "}
          {(Math.max(0, 1 - Math.min(previewSum, 1)) * 100).toFixed(2)}%.
        </Typography>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={() => void save()} disabled={busy}>
            Save
          </Button>
          <Button variant="outlined" onClick={() => void load()} disabled={busy}>
            Reload
          </Button>
        </Box>
        {error ? (
          <Typography color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        ) : null}
        {saved ? (
          <Typography color="success.main" sx={{ mt: 1 }}>
            {saved}
          </Typography>
        ) : null}
      </Paper>
    </List>
  );
}
