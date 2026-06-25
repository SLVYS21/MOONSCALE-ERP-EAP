import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

export const DEFAULT_COUNTRY: CountryCode = (process.env.DEFAULT_PHONE_COUNTRY as CountryCode) ?? 'CI'

export interface NormalizedPhone {
  e164: string | null
  country: string | null
  national: string | null
  isValid: boolean
}

export function normalizePhone(raw: string | null | undefined, defaultCountry: CountryCode = DEFAULT_COUNTRY): NormalizedPhone {
  if (!raw) return { e164: null, country: null, national: null, isValid: false }

  const cleaned = String(raw).replace(/[\s\-().]/g, '').replace(/^00/, '+')
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry)

  if (!parsed) return { e164: null, country: null, national: null, isValid: false }

  return {
    e164: parsed.number,
    country: parsed.country ?? null,
    national: parsed.nationalNumber,
    isValid: parsed.isValid(),
  }
}

export function toE164(raw: string | null | undefined, defaultCountry?: CountryCode): string | null {
  return normalizePhone(raw, defaultCountry).e164
}
