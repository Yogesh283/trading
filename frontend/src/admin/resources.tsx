import { Button } from "@mui/material";
import { useState } from "react";
import {
  BooleanField,
  BooleanInput,
  Datagrid,
  DateField,
  Edit,
  EditButton,
  FunctionField,
  List,
  NumberField,
  NumberInput,
  SelectInput,
  SimpleForm,
  TextField,
  TextInput,
  useNotify,
  useRefresh
} from "react-admin";
import { adminApproveDeposit } from "../api";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

function DepositApproveButton({ record }: { record: { id: string; status: string } }) {
  const refresh = useRefresh();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  if (record.status !== "pending_review") {
    return <span>—</span>;
  }
  return (
    <Button
      size="small"
      variant="contained"
      color="success"
      disabled={busy}
      onClick={() => {
        const t = localStorage.getItem(ADMIN_TOKEN_LS_KEY);
        if (!t) {
          notify("Admin session missing — log in again", { type: "warning" });
          return;
        }
        setBusy(true);
        void (async () => {
          try {
            await adminApproveDeposit(t, record.id);
            notify("Approved — user INR wallet credited", { type: "success" });
            refresh();
          } catch (e) {
            notify(e instanceof Error ? e.message : "Approve failed", { type: "error" });
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      Approve
    </Button>
  );
}

export function DepositList() {
  return (
    <List perPage={25} sort={{ field: "created_at", order: "DESC" }}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="id" />
        <DateField source="created_at" showTime />
        <TextField source="user_email" label="Email" />
        <NumberField source="amount" />
        <TextField source="wallet_provider" label="Wallet" />
        <TextField source="status" />
        <FunctionField
          label="Tx"
          render={(record: { tx_hash?: string | null }) =>
            record?.tx_hash ? (
              <a href={`https://bscscan.com/tx/${record.tx_hash}`} target="_blank" rel="noreferrer">
                BscScan
              </a>
            ) : (
              "—"
            )
          }
        />
        <FunctionField label="Action" render={(r) => <DepositApproveButton record={r} />} />
      </Datagrid>
    </List>
  );
}

export function WithdrawalList() {
  return (
    <List perPage={25} sort={{ field: "created_at", order: "DESC" }}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="id" />
        <DateField source="created_at" showTime />
        <TextField source="user_email" label="Email" />
        <NumberField source="amount" />
        <TextField source="to_address" label="To" />
        <TextField source="status" />
      </Datagrid>
    </List>
  );
}

export function UserList() {
  return (
    <List perPage={25} sort={{ field: "created_at", order: "DESC" }}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <EditButton />
        <TextField source="id" />
        <TextField source="name" />
        <TextField source="phone_country_code" label="Phone CC" emptyText="—" />
        <TextField source="phone_local" label="Phone" emptyText="—" />
        <TextField source="email" />
        <TextField source="inviter_name" label="Upline / inviter" emptyText="—" />
        <TextField source="inviter_email" label="Inviter email" emptyText="—" />
        <NumberField source="direct_team_count" label="Direct team" />
        <NumberField source="total_team_count" label="Total team" />
        <NumberField
          source="direct_team_live_balance_total"
          label="Direct team live (INR)"
          options={{ maximumFractionDigits: 2 }}
        />
        <NumberField
          source="direct_team_deposits_usdt_total"
          label="Direct deps USDT"
          options={{ maximumFractionDigits: 2 }}
        />
        <BooleanField source="withdrawal_totp_enabled" label="Withdraw TPN" />
        <BooleanField source="is_blocked" label="Blocked" />
        <DateField source="last_login_at" label="Last login" showTime emptyText="—" />
        <NumberField source="balance" label="Live USDT" options={{ minimumFractionDigits: 2, maximumFractionDigits: 8 }} />
        <NumberField source="demo_balance" label="Demo" options={{ maximumFractionDigits: 2 }} />
        <TextField source="role" />
        <TextField source="self_referral_code" label="Self ref" />
        <TextField source="referral_code" label="Signup ref code" emptyText="—" />
        <DateField source="created_at" showTime />
      </Datagrid>
    </List>
  );
}

/** Row click or Edit opens this form — saves via PUT /api/admin/ra/users/:id */
export function UserEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm>
        <TextInput source="id" label="Id" disabled fullWidth />
        <TextInput source="name" fullWidth required />
        <TextInput source="phone_country_code" label="Phone country code" disabled fullWidth />
        <TextInput source="phone_local" label="Phone (national digits)" disabled fullWidth />
        <TextInput source="email" type="email" fullWidth required />
        <TextInput source="created_at" label="Created at" disabled fullWidth />
        <SelectInput
          source="role"
          choices={[
            { id: "user", name: "User" },
            { id: "admin", name: "Admin" }
          ]}
          required
        />
        <BooleanInput source="is_blocked" label="Account blocked (login band)" />
        <TextInput source="last_login_at" label="Last login (read-only)" disabled fullWidth />
        <TextInput source="self_referral_code" label="Self ref" fullWidth />
        <TextInput source="referral_code" label="Signup ref code (inviter’s code)" fullWidth />
        <TextInput source="inviter_name" label="Upline / inviter name" disabled fullWidth />
        <TextInput source="inviter_email" label="Inviter email" disabled fullWidth />
        <TextInput source="inviter_id" label="Inviter user id" disabled fullWidth />
        <TextInput source="direct_team_count" label="Direct team (count)" disabled fullWidth />
        <TextInput source="total_team_count" label="Total team (all levels)" disabled fullWidth />
        <TextInput
          source="direct_team_live_balance_total"
          label="Direct team live balance sum (INR)"
          disabled
          fullWidth
        />
        <TextInput
          source="direct_team_deposits_usdt_total"
          label="Direct team credited deposits sum (USDT)"
          disabled
          fullWidth
        />
        <TextInput source="withdrawal_totp_enabled" label="Withdrawal TPN enabled" disabled fullWidth />
        <NumberInput source="balance" label="Live balance (USDT)" min={0} step={0.01} />
        <NumberInput source="demo_balance" label="Demo balance" min={0} step={1} />
        <TextInput
          source="new_password"
          type="password"
          label="Naya password (optional)"
          helperText="The old password is never shown (only a hash is stored). Enter a new password here to update; leave blank to keep the current password."
          fullWidth
          autoComplete="new-password"
        />
      </SimpleForm>
    </Edit>
  );
}

export function WalletList() {
  return (
    <List perPage={25} sort={{ field: "updated_at", order: "DESC" }}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="user_id" label="User id" />
        <NumberField source="balance" label="Live USDT" options={{ maximumFractionDigits: 8 }} />
        <NumberField source="demo_balance" label="Demo" options={{ maximumFractionDigits: 2 }} />
        <DateField source="updated_at" label="Updated" showTime />
      </Datagrid>
    </List>
  );
}

export function TransactionList() {
  return (
    <List perPage={25} sort={{ field: "created_at", order: "DESC" }}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="user_id" label="User id" />
        <TextField source="txn_type" label="Type" />
        <NumberField source="amount" options={{ maximumFractionDigits: 8 }} />
        <NumberField source="before_balance" label="Before" options={{ maximumFractionDigits: 8 }} />
        <NumberField source="after_balance" label="After" options={{ maximumFractionDigits: 8 }} />
        <TextField source="reference_id" label="Ref" emptyText="—" />
        <DateField source="created_at" showTime />
      </Datagrid>
    </List>
  );
}

export function UserInvestmentList() {
  return (
    <List perPage={25} sort={{ field: "user_id", order: "ASC" }}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="user_id" label="User id" />
        <NumberField source="principal" options={{ maximumFractionDigits: 2 }} />
        <TextField source="locked_until" label="Locked until" emptyText="—" />
        <TextField source="last_yield_date" label="Last yield" emptyText="—" />
        <TextField source="last_monthly_yield_ym" label="Last ROI month (UTC)" emptyText="—" />
      </Datagrid>
    </List>
  );
}

export function MarketTickList() {
  return (
    <List perPage={50} sort={{ field: "timestamp", order: "DESC" }}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="symbol" />
        <NumberField source="price" options={{ maximumFractionDigits: 6 }} />
        <NumberField source="timestamp" label="Ts (ms)" />
        <DateField source="tick_at" label="Time (UTC)" showTime />
      </Datagrid>
    </List>
  );
}
