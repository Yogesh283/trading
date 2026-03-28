import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import PeopleIcon from "@mui/icons-material/People";
import SearchIcon from "@mui/icons-material/Search";
import PaymentsIcon from "@mui/icons-material/Payments";
import SavingsIcon from "@mui/icons-material/Savings";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import WalletIcon from "@mui/icons-material/Wallet";
import PercentIcon from "@mui/icons-material/Percent";
import GroupsIcon from "@mui/icons-material/Groups";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import React from "react";
import ReactDOM from "react-dom/client";
import { Admin, Resource } from "react-admin";
import { AdminAppLayout } from "./AdminLayout";
import { adminAuthProvider } from "./authProvider";
import { adminDataProvider } from "./dataProvider";
import { AdminLoginPage } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";
import { ReferralLevelSettingsPage } from "./ReferralLevelSettingsPage";
import { InvestmentRoiSettingsPage } from "./InvestmentRoiSettingsPage";
import {
  DepositList,
  MarketTickList,
  SupportTicketEdit,
  SupportTicketList,
  SupportTicketShow,
  TransactionList,
  UserEdit,
  UserInvestmentList,
  UserList,
  WalletEdit,
  WalletList,
  WithdrawalList
} from "./resources";
import { UserInsightsPage } from "./UserInsightsPage";
import { TeamBusinessReportPage } from "./TeamBusinessReportPage";
import "../site-frame.css";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#00e676" },
    background: { default: "#0a0a0a", paper: "#121418" }
  }
});

const adminMount = document.getElementById("admin-root");
if (!adminMount) {
  throw new Error(
    'Admin UI needs <div id="admin-root"></div> in the page. Open /admin or /admin.html from this app (not a bare HTML file).'
  );
}

ReactDOM.createRoot(adminMount).render(
  <React.StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Admin
        layout={AdminAppLayout}
        dashboard={AdminDashboard}
        dataProvider={adminDataProvider}
        authProvider={adminAuthProvider}
        loginPage={AdminLoginPage}
        title="UpDown FX · Admin"
        requireAuth
        disableTelemetry
      >
        <Resource name="deposits" list={DepositList} icon={AccountBalanceWalletIcon} options={{ label: "Deposits" }} />
        <Resource name="withdrawals" list={WithdrawalList} icon={PaymentsIcon} options={{ label: "Withdrawals" }} />
        <Resource
          name="support_tickets"
          list={SupportTicketList}
          edit={SupportTicketEdit}
          show={SupportTicketShow}
          icon={SupportAgentIcon}
          options={{ label: "Help tickets" }}
        />
        <Resource
          name="users"
          list={UserList}
          edit={UserEdit}
          icon={PeopleIcon}
          options={{ label: "Users" }}
          recordRepresentation="id"
        />
        <Resource
          name="wallets"
          list={WalletList}
          edit={WalletEdit}
          icon={WalletIcon}
          options={{ label: "Wallets" }}
        />
        <Resource name="transactions" list={TransactionList} icon={ReceiptLongIcon} options={{ label: "Transactions" }} />
        <Resource
          name="user_investments"
          list={UserInvestmentList}
          icon={SavingsIcon}
          options={{ label: "User investments" }}
        />
        <Resource name="market_ticks" list={MarketTickList} icon={ShowChartIcon} options={{ label: "Market ticks" }} />
        <Resource
          name="user_insights"
          list={UserInsightsPage}
          icon={SearchIcon}
          options={{ label: "User insights" }}
        />
        <Resource
          name="team_business"
          list={TeamBusinessReportPage}
          icon={GroupsIcon}
          options={{ label: "Team business" }}
        />
        <Resource
          name="referral_level_settings"
          list={ReferralLevelSettingsPage}
          icon={AccountTreeIcon}
          options={{ label: "Referral / level %" }}
        />
        <Resource
          name="investment_roi_settings"
          list={InvestmentRoiSettingsPage}
          icon={PercentIcon}
          options={{ label: "Investment ROI %" }}
        />
      </Admin>
    </ThemeProvider>
  </React.StrictMode>
);
