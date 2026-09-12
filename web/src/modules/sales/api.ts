import { supabase } from '../../lib/supabase'
import type {
  MarginAchieved, SalesGroupOutcome, SalesOutcome, SalesPipelineRow,
} from '../../lib/database.types'

/** The sales reports (roadmap 3.6). Every one of them is read-only. */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function listSalesOutcomes(): Promise<SalesOutcome[]> {
  const { data, error } = await supabase.from('v_sales_outcomes').select('*')
  fail('Could not load the sales record', error)
  return (data ?? []) as SalesOutcome[]
}

export async function listGroupOutcomes(): Promise<SalesGroupOutcome[]> {
  const { data, error } = await supabase.from('v_sales_group_outcomes').select('*')
  fail('Could not load the figures by product group', error)
  return (data ?? []) as SalesGroupOutcome[]
}

export async function listMarginAchieved(): Promise<MarginAchieved[]> {
  const { data, error } = await supabase.from('v_margin_achieved').select('*')
  fail('Could not load the margins', error)
  return (data ?? []) as MarginAchieved[]
}

export async function listPipeline(): Promise<SalesPipelineRow[]> {
  const { data, error } = await supabase
    .from('v_sales_pipeline').select('*').order('age_days', { ascending: false })
  fail('Could not load the pipeline', error)
  return (data ?? []) as SalesPipelineRow[]
}
