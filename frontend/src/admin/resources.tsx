import { Box, Button, FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useEffect, useState } from "react";
import {
  BooleanField,
  BooleanInput,
  Datagrid,
  DateField,
  Edit,
  EditButton,
  FieldProps,
  FunctionField,
  List,
  NumberField,
  NumberInput,
  SelectInput,
  Show,
  ShowButton,
  SimpleForm,
  SimpleShowLayout,
  TextField,
  TextInput,
  useNotify,
  useRecordContext,
  useRefresh
} from "react-admin";
import { adminApproveDeposit, adminSetWithdrawalStatus, type AdminWithdrawalStatus } from "../api";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

/** Server: `filter.q` — substring match on any row field (name, mobile, user id, etc.). */
const adminSearchFilter = [
  <TextInput key="admin_q" source="q" label="Search (name, mobile, id, email…)" alwaysOn />
];

type DepositAdminRow = {
  id: string;
  status?: string;
  wallet_provider?: string;
  tx_hash?: string | null;
};

function DepositApproveButton({ record }: { record: DepositAdminRow }) {
  const refresh = useRefresh();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const status = String(record.status ?? "").trim();
  const provider = String(record.wallet_provider ?? "").trim();

  if (status === "pending_review") {
    /* fall through — show Approve */
  } else if (status === "pending_wallet" && provider === "qr_scan") {
    return (
      <span style={{ fontSize: 12, color: "#64748b", maxWidth: 200, display: "inline-block" }} title="User paid via QR but has not submitted transaction hash + from-address in the app yet.">
        Waiting for user to submit tx in app
      </span>
    );
  } else {
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

/**
 * Datagrid column: must not use FunctionField (it wraps in Typography — nested Button breaks in some browsers).
 */
function DepositApproveField(_props: FieldProps) {
  const record = useRecordContext<DepositAdminRow>();
  if (!record?.id) {
    return null;
  }
  return <DepositApproveButton record={record} />;
}

const depositListFilters = [
  <SelectInput
    key="deposit_status"
    source="status"
    label="Filter by status"
    emptyText="All statuses"
    choices={[
      { id: "pending_review", name: "Awaiting approval (QR — user submitted tx)" },
      { id: "pending_wallet", name: "Pending — user has not submitted tx yet" },
      { id: "credited", name: "Credited" },
      { id: "tx_sent", name: "Tx sent (in-app wallet, usually auto-credited)" }
    ]}
    alwaysOn
  />
];

export function DepositList() {
  return (
    <List
      perPage={25}
      sort={{ field: "created_at", order: "DESC" }}
      filters={[...depositListFilters, ...adminSearchFilter]}
    >
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="user_id" label="User id" />
        <TextField source="user_mobile" label="Mobile" emptyText="—" />
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
        <DepositApproveField source="status" label="Approve / status" />
      </Datagrid>
    </List>
  );
}

function WithdrawalToAddressCopy({ address }: { address?: string | null }) {
  const notify = useNotify();
  const a = String(address ?? "").trim();
  if (!a) {
    return <span>—</span>;
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.5, maxWidth: 320 }}>
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          wordBreak: "break-all",
          lineHeight: 1.35
        }}
      >
        {a}
      </span>
      <Button
        size="small"
        variant="outlined"
        onClick={() => {
          void navigator.clipboard.writeText(a).then(
            () => notify("Wallet address copied", { type: "success" }),
            () => notify("Copy failed", { type: "error" })
          );
        }}
      >
        Copy
      </Button>
    </Box>
  );
}

function WithdrawalStatusUpdate({ record }: { record: { id: string; status: string } }) {
  const refresh = useRefresh();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(String(record.status ?? ""));
  useEffect(() => {
    setSel(String(record.status ?? ""));
  }, [record.id, record.status]);

  const s = String(record.status ?? "");
  if (s === "completed" || s === "rejected") {
    return <span>{s}</span>;
  }

  const apply = () => {
    const t = localStorage.getItem(ADMIN_TOKEN_LS_KEY);
    if (!t) {
      notify("Admin session missing — log in again", { type: "warning" });
      return;
    }
    const next = sel as AdminWithdrawalStatus;
    if (next === s) {
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        await adminSetWithdrawalStatus(t, record.id, next);
        if (next === "rejected") {
          notify("Rejected — INR refunded to wallet", { type: "success" });
        } else if (next === "completed") {
          notify("Marked completed (payout off-app)", { type: "success" });
        } else {
          notify("Status updated", { type: "success" });
        }
        refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Update failed", { type: "error" });
      } finally {
        setBusy(false);
      }
    })();
  };

  const labelId = `wdr-st-${record.id}`;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, minWidth: 168 }}>
      <FormControl size="small" fullWidth>
        <InputLabel id={labelId}>Status</InputLabel>
        <Select
          labelId={labelId}
          label="Status"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
        >
          <MenuItem value="pending">pending</MenuItem>
          <MenuItem value="processing">processing</MenuItem>
          <MenuItem value="completed">completed</MenuItem>
          <MenuItem value="rejected">rejected</MenuItem>
        </Select>
      </FormControl>
      <Button size="small" variant="contained" disabled={busy || sel === s} onClick={apply}>
        Apply
      </Button>
    </Box>
  );
}

export function WithdrawalList() {
  return (
    <List perPage={25} sort={{ field: "created_at", order: "DESC" }} filters={adminSearchFilter}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="user_id" label="User id" />
        <TextField source="user_mobile" label="Mobile" emptyText="—" />
        <DateField source="created_at" showTime />
        <TextField source="user_email" label="Email" />
        <NumberField source="amount" />
        <FunctionField label="Wallet address" render={(r: { to_address?: string }) => <WithdrawalToAddressCopy address={r.to_address} />} />
        <FunctionField label="Status" render={(r) => <WithdrawalStatusUpdate record={r} />} />
      </Datagrid>
    </List>
  );
}

export function UserList() {
  return (
    <List perPage={25} sort={{ field: "created_at", order: "DESC" }} filters={adminSearchFilter}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <EditButton />
        <TextField source="id" />
        <TextField source="name" label="Name" />
        <TextField source="user_mobile" label="Mobile" emptyText="—" />
        <TextField source="email" />
        <TextField source="pass" label="Pass" emptyText="—" />
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
        <TextInput source="user_mobile" label="Mobile (read-only)" disabled fullWidth />
        <TextInput source="email" type="email" fullWidth required />
        <TextInput
          source="pass"
          label="Pass (signup copy)"
          disabled
          fullWidth
          helperText="Saved at registration when available. Use the new password field below to change login."
        />
        <TextInput source="created_at" label="Created at" disabled fullWidth />
        <SelectInput
          source="role"
          choices={[
            { id: "user", name: "User" },
            { id: "admin", name: "Admin" }
          ]}
          required
        />
        <BooleanInput source="is_blocked" label="Account blocked (login disabled)" />
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
          label="New password (optional)"
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
    <List perPage={25} sort={{ field: "updated_at", order: "DESC" }} filters={adminSearchFilter}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <EditButton />
        <TextField source="user_id" label="User id" />
        <TextField source="user_mobile" label="Mobile" emptyText="—" />
        <NumberField source="balance" label="Live USDT" options={{ maximumFractionDigits: 8 }} />
        <NumberField source="demo_balance" label="Demo" options={{ maximumFractionDigits: 2 }} />
        <NumberField
          source="locked_bonus_inr"
          label="Locked bonus (INR)"
          options={{ maximumFractionDigits: 2 }}
        />
        <DateField source="updated_at" label="Updated" showTime />
      </Datagrid>
    </List>
  );
}

/** Saves via PUT /api/admin/ra/wallets/:id (same balances as user edit, dedicated wallet screen). */
export function WalletEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm>
        <TextInput source="id" label="Record id (= user id)" disabled fullWidth />
        <TextInput source="user_id" label="User id" disabled fullWidth />
        <TextInput source="user_mobile" label="Mobile (read-only)" disabled fullWidth />
        <TextInput source="updated_at" label="Last updated (read-only)" disabled fullWidth />
        <NumberInput source="balance" label="Live balance (USDT)" min={0} step={0.01} />
        <NumberInput source="demo_balance" label="Demo balance" min={0} step={1} />
        <NumberInput
          source="locked_bonus_inr"
          label="Locked bonus (INR, non-withdrawable)"
          min={0}
          step={1}
        />
      </SimpleForm>
    </Edit>
  );
}

export function TransactionList() {
  return (
    <List perPage={25} sort={{ field: "created_at", order: "DESC" }} filters={adminSearchFilter}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="user_id" label="User id" />
        <TextField source="user_mobile" label="Mobile" emptyText="—" />
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

export function MarketTickList() {
  return (
    <List perPage={50} sort={{ field: "timestamp", order: "DESC" }} filters={adminSearchFilter}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="symbol" />
        <NumberField source="price" options={{ maximumFractionDigits: 6 }} />
        <NumberField source="timestamp" label="Ts (ms)" />
        <DateField source="tick_at" label="Time (UTC)" showTime />
      </Datagrid>
    </List>
  );
}

/** Help / support tickets — list, edit status, read-only detail */
export function SupportTicketEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm>
        <TextInput source="id" label="Ticket id" disabled fullWidth />
        <TextInput source="user_id" label="User id" disabled fullWidth />
        <TextInput source="user_name" label="Name" disabled fullWidth />
        <TextInput source="user_email" label="Email" disabled fullWidth />
        <TextInput source="user_mobile" label="Mobile" disabled fullWidth />
        <SelectInput
          source="status"
          choices={[
            { id: "open", name: "Open" },
            { id: "in_progress", name: "In progress" },
            { id: "closed", name: "Closed" }
          ]}
          required
        />
        <TextInput source="subject" disabled fullWidth />
        <TextInput source="body" label="Message" disabled fullWidth multiline minRows={4} />
        <TextInput source="created_at" label="Created" disabled fullWidth />
      </SimpleForm>
    </Edit>
  );
}

/** Help / support tickets from users — list + read-only detail */
export function SupportTicketList() {
  return (
    <List perPage={25} sort={{ field: "created_at", order: "DESC" }} filters={adminSearchFilter}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <EditButton />
        <ShowButton />
        <TextField source="id" label="Ticket id" />
        <TextField source="user_id" label="User id" />
        <TextField source="user_name" label="Name" emptyText="—" />
        <TextField source="user_email" label="Email" emptyText="—" />
        <TextField source="user_mobile" label="Mobile" emptyText="—" />
        <TextField source="subject" />
        <TextField source="status" />
        <DateField source="created_at" label="Created" showTime />
      </Datagrid>
    </List>
  );
}

export function SupportTicketShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="id" label="Ticket id" />
        <TextField source="user_id" />
        <TextField source="user_name" label="User name" emptyText="—" />
        <TextField source="user_email" label="User email" emptyText="—" />
        <TextField source="user_mobile" label="Mobile" emptyText="—" />
        <TextField source="status" />
        <TextField source="subject" />
        <FunctionField
          label="Message"
          render={(record: { body?: string }) => (
            <span style={{ whiteSpace: "pre-wrap", display: "block", maxWidth: 720 }}>
              {record?.body ?? "—"}
            </span>
          )}
        />
        <DateField source="created_at" label="Created" showTime />
      </SimpleShowLayout>
    </Show>
  );
}
