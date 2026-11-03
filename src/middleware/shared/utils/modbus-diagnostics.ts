/** Shared contract for the Editor and Modbus Master diagnostics sidecar v1. */
export const DIAGNOSTIC_FIELDS = {
  ok: { type: 'BOOL', bank: 'X', label: 'CommOK' },
  response_ok: { type: 'BOOL', bank: 'X', label: 'ResponseOK' },
  status: { type: 'UINT', bank: 'W', label: 'Status' },
  last_error: { type: 'UINT', bank: 'W', label: 'LastError' },
  success_count: { type: 'UDINT', bank: 'D', label: 'SuccessCount' },
  error_count: { type: 'UDINT', bank: 'D', label: 'ErrorCount' },
  consecutive_errors: { type: 'UDINT', bank: 'D', label: 'ConsecutiveErrors' },
  age_ms: { type: 'UDINT', bank: 'D', label: 'AgeMs' },
  publish_counter: { type: 'UDINT', bank: 'D', label: 'UpdateCounter' },
} as const
export type DiagnosticField = keyof typeof DIAGNOSTIC_FIELDS
export interface ModbusDiagnostics {
  variables?: { pou: string; prefix: string }
  enabled: boolean
  staleMs: number
  locations: Partial<Record<DiagnosticField, string>>
}
export function diagnosticDefaults(base = 100): ModbusDiagnostics {
  return {
    enabled: true,
    staleMs: 3000,
    locations: {
      ok: `%MX${base}.0`,
      response_ok: `%MX${base}.1`,
      status: `%MW${base}`,
      last_error: `%MW${base + 1}`,
      success_count: `%MD${base}`,
      error_count: `%MD${base + 1}`,
      consecutive_errors: `%MD${base + 2}`,
      age_ms: `%MD${base + 3}`,
      publish_counter: `%MD${base + 4}`,
    },
  }
}
export function validateDiagnostics(d: ModbusDiagnostics, cycleTime: number): string[] {
  const errors: string[] = []
  if (!Number.isInteger(d.staleMs) || d.staleMs < Math.max(200, cycleTime) || d.staleMs > 4294967294)
    errors.push(`Stale time must be an integer >= ${Math.max(200, cycleTime)} ms and <= 4294967294.`)
  if (!d.enabled) return errors
  if (!d.locations.ok) errors.push('CommOK address is required.')
  const used = new Set<string>()
  for (const [key, address] of Object.entries(d.locations)) {
    if (!address) continue
    const field = DIAGNOSTIC_FIELDS[key as DiagnosticField]
    const match = /^%M([XWD])(0|[1-9]\d*)(?:\.([0-7]))?$/.exec(address)
    if (
      !field ||
      !match ||
      match[1] !== field.bank ||
      Number(match[2]) > 1023 ||
      (field.bank === 'X' ? match[3] === undefined : match[3] !== undefined)
    ) {
      errors.push(`${key}: use %M${field?.bank ?? '?'} address, index 0..1023.`)
    }
    if (used.has(address)) errors.push(`Duplicate address: ${address}`)
    used.add(address)
  }
  return errors
}
