import { supabase } from '../../lib/supabase'
import type {
  CurrencyFactor,
  EffectiveCurrencyFactor,
  EffectiveMaterialRate,
  LabourRate,
  MaterialRate,
} from '../../lib/database.types'
import { fail } from './api'

/**
 * The three tables of numbers that turn hours, weights and purchase prices
 * into money: labour rates per hour, material rates per kilogram, and the
 * landed factor per currency (KES per 1 unit). Each has master defaults and
 * company overrides.
 */

// --- rates -----------------------------------------------------------------

/** Raw rows: master rows have company_id null, the company's own have its id. */
export async function listLabourRates(): Promise<LabourRate[]> {
  const { data, error } = await supabase.from('labour_rates').select('*')
  fail('Could not load labour rates', error)
  return (data ?? []) as LabourRate[]
}

export async function setLabourRate(
  companyId: string,
  processType: string,
  hourlyRate: number,
): Promise<void> {
  const { error } = await supabase
    .from('labour_rates')
    .upsert(
      { company_id: companyId, process_type: processType, hourly_rate: hourlyRate },
      { onConflict: 'company_id,process_type' },
    )
  fail('Could not save the rate', error)
}

export async function listMaterialRates(): Promise<MaterialRate[]> {
  const { data, error } = await supabase.from('material_rates').select('*').order('code')
  fail('Could not load material rates', error)
  return (data ?? []) as MaterialRate[]
}

/** What this company actually pays per kilogram, its own rate or the master. */
export async function listEffectiveMaterialRates(): Promise<EffectiveMaterialRate[]> {
  const { data, error } = await supabase.from('v_material_rates').select('*').order('code')
  fail('Could not load material rates', error)
  return (data ?? []) as EffectiveMaterialRate[]
}

/** The company's own rate, in the currency given (its own currency on screen). */
export async function setMaterialRate(
  companyId: string,
  code: string,
  name: string,
  rate: number,
  currencyCode: string,
): Promise<void> {
  const { error } = await supabase
    .from('material_rates')
    .upsert({ company_id: companyId, code, name, unit: 'kg', rate, currency_code: currencyCode }, { onConflict: 'company_id,code' })
  fail('Could not save the rate', error)
}

export async function updateMasterMaterialRate(id: string, rate: number): Promise<void> {
  const { error } = await supabase.from('material_rates').update({ rate }).eq('id', id)
  fail('Could not save the rate', error)
}

// --- currency factors --------------------------------------------------------

/** Raw rows: master rows have company_id null, the company's own have its id. */
export async function listCurrencyFactors(): Promise<CurrencyFactor[]> {
  const { data, error } = await supabase.from('currency_factors').select('*').order('currency_code')
  fail('Could not load currency factors', error)
  return (data ?? []) as CurrencyFactor[]
}

/** Per currency: the company's own landed factor, or the master's. */
export async function listEffectiveCurrencyFactors(): Promise<EffectiveCurrencyFactor[]> {
  const { data, error } = await supabase.from('v_currency_factors').select('*').order('currency_code')
  fail('Could not load currency factors', error)
  return (data ?? []) as EffectiveCurrencyFactor[]
}

/** The company's own factor for a currency, leaving the master alone. */
export async function setCurrencyFactor(
  companyId: string,
  currencyCode: string,
  landedFactor: number,
): Promise<void> {
  const { error } = await supabase
    .from('currency_factors')
    .upsert(
      { company_id: companyId, currency_code: currencyCode, landed_factor: landedFactor },
      { onConflict: 'company_id,currency_code' },
    )
  fail('Could not save the currency factor', error)
}

export async function clearCurrencyFactor(ownId: string): Promise<void> {
  const { error } = await supabase.from('currency_factors').delete().eq('id', ownId)
  fail('Could not remove your factor', error)
}

/** Master admin: change a master row, or add a currency the library may buy in. */
export async function updateMasterCurrencyFactor(id: string, landedFactor: number): Promise<void> {
  const { error } = await supabase
    .from('currency_factors')
    .update({ landed_factor: landedFactor })
    .eq('id', id)
  fail('Could not save the currency factor', error)
}

export async function addMasterCurrency(currencyCode: string, landedFactor: number): Promise<void> {
  const { error } = await supabase.from('currency_factors').insert({
    company_id: null, currency_code: currencyCode, landed_factor: landedFactor,
  })
  fail('Could not add the currency', error)
}

