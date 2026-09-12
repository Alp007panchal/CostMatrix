import type { SupabaseClient } from '@supabase/supabase-js'
import type { Db } from './tools.ts'

/**
 * The database as the assistant's tools see it — through the signed-in user's
 * own Supabase client, so row-level security decides what comes back. No
 * service role anywhere in the assistant path (AI spec §4).
 */
export class SupabaseDb implements Db {
  constructor(private readonly client: SupabaseClient) {}

  async rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.client.rpc(name, args)
    if (error) throw new Error(error.message)
    return data ?? null
  }

  async insertProposal(row: Parameters<Db['insertProposal']>[0]): Promise<string> {
    const { data, error } = await this.client
      .from('assistant_proposals')
      .insert({
        conversation_id: row.conversation_id,
        message_id: row.message_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        type: row.type,
        payload: row.payload,
        // company_id is filled by the insert below only if the caller may; the
        // policy checks company_id = current company, so we ask the database.
        company_id: await this.companyId(),
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return (data as { id: string }).id
  }

  private companyCache: string | null = null
  private async companyId(): Promise<string> {
    if (this.companyCache) return this.companyCache
    const policy = (await this.rpc('company_policy', {})) as { company?: { id?: string } } | null
    const id = policy?.company?.id
    if (!id) throw new Error('you do not belong to a company')
    this.companyCache = id
    return id
  }
}
