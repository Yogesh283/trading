export type PhoneCountryOption = { code: string; label: string; /** flagcdn.com alpha-2 */ iso2: string };

/** Dial codes for login/register (digits only, no +). Order: common for South Asia first. */
export const PHONE_COUNTRY_OPTIONS: ReadonlyArray<PhoneCountryOption> = [
  { code: "91", label: "India (+91)", iso2: "in" },
  { code: "92", label: "Pakistan (+92)", iso2: "pk" },
  { code: "880", label: "Bangladesh (+880)", iso2: "bd" },
  { code: "94", label: "Sri Lanka (+94)", iso2: "lk" },
  { code: "977", label: "Nepal (+977)", iso2: "np" },
  { code: "93", label: "Afghanistan (+93)", iso2: "af" },
  { code: "971", label: "UAE (+971)", iso2: "ae" },
  { code: "966", label: "Saudi Arabia (+966)", iso2: "sa" },
  { code: "974", label: "Qatar (+974)", iso2: "qa" },
  { code: "965", label: "Kuwait (+965)", iso2: "kw" },
  { code: "968", label: "Oman (+968)", iso2: "om" },
  { code: "973", label: "Bahrain (+973)", iso2: "bh" },
  { code: "1", label: "USA / Canada (+1)", iso2: "us" },
  { code: "44", label: "United Kingdom (+44)", iso2: "gb" },
  { code: "61", label: "Australia (+61)", iso2: "au" },
  { code: "49", label: "Germany (+49)", iso2: "de" },
  { code: "33", label: "France (+33)", iso2: "fr" },
  { code: "39", label: "Italy (+39)", iso2: "it" },
  { code: "34", label: "Spain (+34)", iso2: "es" },
  { code: "7", label: "Russia / Kazakhstan (+7)", iso2: "ru" },
  { code: "86", label: "China (+86)", iso2: "cn" },
  { code: "81", label: "Japan (+81)", iso2: "jp" },
  { code: "82", label: "South Korea (+82)", iso2: "kr" },
  { code: "65", label: "Singapore (+65)", iso2: "sg" },
  { code: "60", label: "Malaysia (+60)", iso2: "my" },
  { code: "62", label: "Indonesia (+62)", iso2: "id" },
  { code: "66", label: "Thailand (+66)", iso2: "th" },
  { code: "84", label: "Vietnam (+84)", iso2: "vn" },
  { code: "63", label: "Philippines (+63)", iso2: "ph" },
  { code: "27", label: "South Africa (+27)", iso2: "za" },
  { code: "234", label: "Nigeria (+234)", iso2: "ng" },
  { code: "254", label: "Kenya (+254)", iso2: "ke" },
  { code: "20", label: "Egypt (+20)", iso2: "eg" },
  { code: "90", label: "Turkey (+90)", iso2: "tr" },
  { code: "98", label: "Iran (+98)", iso2: "ir" },
  { code: "964", label: "Iraq (+964)", iso2: "iq" }
];

/** Resolve flagcdn alpha-2 when the typed dial code exactly matches a listed option. */
export function iso2ForPhoneCountryCode(dialCode: string): string | null {
  const digits = dialCode.replace(/\D/g, "");
  if (!digits) return null;
  return PHONE_COUNTRY_OPTIONS.find((o) => o.code === digits)?.iso2 ?? null;
}
