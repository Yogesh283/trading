import PhoneInput, { type Value } from "react-phone-number-input";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import "react-phone-number-input/style.css";
import "./authPhoneField.css";

type Props = {
  countryCode: string;
  phone: string;
  onChange: (countryCode: string, nationalPhone: string) => void;
  disabled?: boolean;
};

function e164FromParts(cc: string, nat: string): Value | undefined {
  const c = cc.replace(/\D/g, "");
  const n = nat.replace(/\D/g, "");
  if (!c) {
    return undefined;
  }
  if (!n) {
    return `+${c}` as Value;
  }
  const raw = `+${c}${n}`;
  const parsed = parsePhoneNumberFromString(raw);
  return (parsed?.number ?? raw) as Value;
}

function splitFromValue(val: string | undefined): { cc: string; nat: string } {
  if (!val || val === "+") {
    return { cc: "", nat: "" };
  }
  const parsed = parsePhoneNumberFromString(val);
  if (parsed) {
    return { cc: String(parsed.countryCallingCode), nat: String(parsed.nationalNumber) };
  }
  const compact = val.replace(/\s/g, "");
  const m = compact.match(/^\+(\d{1,4})(\d*)$/);
  if (m) {
    return { cc: m[1]!, nat: (m[2] ?? "").replace(/\D/g, "") };
  }
  return { cc: "", nat: "" };
}

/**
 * Register flow: country + flag via `react-phone-number-input` (bundled flag icons).
 * Parent keeps `countryCode` + `phone` (national digits) as today for the API.
 */
export function AuthPhoneField({ countryCode, phone, onChange, disabled }: Props) {
  return (
    <div className="auth-phone-npm">
      <PhoneInput
        international
        defaultCountry="IN"
        countryCallingCodeEditable={false}
        smartCaret
        value={e164FromParts(countryCode, phone)}
        disabled={disabled}
        onChange={(val) => {
          if (val == null || val === "") {
            onChange("", "");
            return;
          }
          const { cc, nat } = splitFromValue(val);
          onChange(cc, nat);
        }}
        numberInputProps={{
          className: "auth-phone-npm-number",
          autoComplete: "tel-national",
          placeholder: "9876543210"
        }}
      />
    </div>
  );
}
