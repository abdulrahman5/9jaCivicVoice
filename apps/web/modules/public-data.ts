import "server-only";
import { civicPublicClient } from "@civicvoice/db";
import type { IssueStatus } from "@civicvoice/validation";
import { isConfigured } from "./env";

/** Reads from the public_read schema only (anon key, RLS-safe, CDN-cacheable). */

export interface FeedIssue {
  ref_code: string;
  title: string;
  category: string;
  lga: string | null;
  status: IssueStatus;
  metoo_count: number;
  created_at: string;
}

export interface TimelineEvent {
  to_status: IssueStatus;
  public_note: string | null;
  actor_type: string;
  created_at: string;
}

export interface ScorecardRow {
  agency_name: string;
  city: string;
  reports: number;
  ack_within_7d_pct: number | null;
  median_days_to_resolve: number | null;
  confirmed_pct: number | null;
}

function client() {
  return isConfigured("supabase") ? civicPublicClient().schema("public_read") : null;
}

export async function latestIssues(city: string, limit = 5): Promise<FeedIssue[]> {
  const c = client();
  if (!c) return [];
  const { data, error } = await c
    .from("issues_feed")
    .select("ref_code,title,category,lga,status,metoo_count,created_at")
    .eq("city", city)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FeedIssue[];
}

export async function issueByRef(ref: string) {
  const c = client();
  if (!c) return null;
  const { data: issue, error } = await c.from("issues_feed").select("*").eq("ref_code", ref).maybeSingle();
  if (error) throw error;
  if (!issue) return null;
  const { data: events, error: eventsError } = await c
    .from("issue_timeline")
    .select("to_status,public_note,actor_type,created_at")
    .eq("ref_code", ref)
    .order("created_at", { ascending: true });
  if (eventsError) throw eventsError;
  return { issue: issue as FeedIssue, events: (events ?? []) as TimelineEvent[] };
}

export async function scorecard(city: string): Promise<ScorecardRow[]> {
  const c = client();
  if (!c) return [];
  const { data, error } = await c
    .from("scorecard")
    .select("*")
    .eq("city", city)
    .order("ack_within_7d_pct", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as ScorecardRow[];
}
