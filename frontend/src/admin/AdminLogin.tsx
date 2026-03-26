import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { Box, IconButton, InputAdornment } from "@mui/material";
import { useState } from "react";
import { Login, LoginForm, TextInput } from "react-admin";

export function AdminLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <Login>
      <Box sx={{ width: "100%", maxWidth: 360, mx: "auto" }}>
        <LoginForm>
          <TextInput
            source="username"
            label="Email (admin user)"
            type="email"
            autoComplete="username"
            fullWidth
          />
          <TextInput
            source="password"
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    edge="end"
                    size="small"
                  >
                    {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </LoginForm>
      </Box>
    </Login>
  );
}
