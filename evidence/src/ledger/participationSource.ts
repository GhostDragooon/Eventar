/**
 * Participation data seam.
 *
 * Agents and the orchestrator depend only on ParticipationSource.
 * Swap MockParticipationSource for a Supabase-backed implementation without
 * changing agent or orchestrator code.
 *
 * chain_verified MUST come from the deterministic integrity check in the
 * main app (Supabase / TypeScript). Never compute the hash chain here.
 */

export type { ParticipationSource, EventRecord, LedgerEntry } from '../types.js';
export { MockParticipationSource } from './mockParticipationSource.js';

/*
 * Drop-in for the main app (Server Action / service-role only):
 *
 * import type { SupabaseClient } from '@supabase/supabase-js';
 * import type { EventRecord, LedgerEntry, ParticipationSource } from './participationSource';
 *
 * export class SupabaseParticipationSource implements ParticipationSource {
 *   constructor(private readonly admin: SupabaseClient) {}
 *
 *   async getEvent(eventId: string): Promise<EventRecord | null> {
 *     // Map events row → pathway + frozen_rule_version.
 *     // Until a real rule_version column exists, return null for frozen_rule_version
 *     // when no credit has been issued / config is not frozen — agent will
 *     // human_review_required rather than invent a version string.
 *     throw new Error('SupabaseParticipationSource: wire to live schema');
 *   }
 *
 *   async listEntries(eventId: string): Promise<LedgerEntry[]> {
 *     // Read credit_ledger for event; join practitioner_licence_id;
 *     // attach chain_verified from the deterministic verifier result store.
 *     throw new Error('SupabaseParticipationSource: wire to live schema');
 *   }
 * }
 */
