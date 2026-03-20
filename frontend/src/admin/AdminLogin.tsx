import { Box } from "@mui/material";
import { Login, LoginForm, TextInput } from "react-admin";

export function AdminLoginPage() {
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
            type="password"
            autoComplete="current-password"
            fullWidth
          />
        </LoginForm>
      </Box>
    </Login>
  );
}
