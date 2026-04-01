import SearchIcon from "@mui/icons-material/Search";
import { Box, InputAdornment, TextField, Toolbar } from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import { useCallback, useRef, useState } from "react";
import { AppBar, SidebarToggleButton, TitlePortal } from "react-admin";
import { useNavigate } from "react-router-dom";
import { getAdminApiUrl } from "../backendOrigin";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

type UserSearchHit = { id: string; name: string; email: string; user_mobile: string };

async function fetchUserSearchMatches(q: string): Promise<UserSearchHit[]> {
  const t = q.trim();
  if (t.length < 1) {
    return [];
  }
  const token = localStorage.getItem(ADMIN_TOKEN_LS_KEY) ?? "";
  const res = await fetch(getAdminApiUrl(`admin/user-insights?search=${encodeURIComponent(t)}`), {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const data = (await res.json().catch(() => ({}))) as { matches?: UserSearchHit[]; message?: string };
  if (!res.ok) {
    return [];
  }
  return data.matches ?? [];
}

export function AdminAppBar() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<UserSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const hits = await fetchUserSearchMatches(q);
      setOptions(hits);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AppBar>
      <Toolbar
        sx={{
          gap: 1,
          flexWrap: { xs: "wrap", md: "nowrap" },
          py: { xs: 1, sm: 0.5 }
        }}
      >
        <SidebarToggleButton />
        <TitlePortal />
        <Box
          sx={{
            flex: 1,
            minWidth: { xs: "100%", sm: 220 },
            maxWidth: 520,
            order: { xs: 3, sm: 0 }
          }}
        >
          <Autocomplete<UserSearchHit, false, false, false>
            size="small"
            loading={loading}
            options={options}
            inputValue={input}
            filterOptions={(x) => x}
            getOptionLabel={(o) => `${o.name} · ${o.user_mobile || "—"} · ${o.id}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText={input.trim().length < 1 ? "Type name, mobile, email, or user id" : "No users found"}
            onChange={(_, v) => {
              if (v?.id) {
                navigate(`/users/${encodeURIComponent(v.id)}/edit`);
                setInput("");
                setOptions([]);
              }
            }}
            onInputChange={(_, v, reason) => {
              setInput(v);
              if (debounceRef.current) {
                clearTimeout(debounceRef.current);
              }
              if (reason === "reset") {
                return;
              }
              debounceRef.current = setTimeout(() => {
                void runSearch(v);
              }, 280);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search user — name, mobile, email, id…"
                variant="outlined"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ color: "action.active", ml: 0.25 }} />
                    </InputAdornment>
                  )
                }}
              />
            )}
          />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
