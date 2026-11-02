/**
 * Persistence for builds, community publishing, ratings and alerts.
 *
 * Every function is a thin, typed wrapper over Supabase with RLS doing the
 * authorisation. Mapping follows the same snake_case â†’ camelCase convention as
 * `componentsService`.
 */
import type { PCComponent } from '@/types/components';
import type { BuildScoreBreakdown, UseCase } from '@/types/build';
import type { Database } from '@/types/database';
import { isSupabaseConfigured, requireSupabase, supabase } from './supabaseClient';
import { mapComponentRow } from './componentsService';
import { slugify } from '@/lib/utils';
import i18n from '@/i18n';

type BuildRow = Database['public']['Tables']['builds']['Row'];

export interface SavedBuild {
  id: string;
  userId: string | null;
  name: string;
  slug: string;
  description: string | null;
  useCase: string | null;
  totalPrice: number;
  totalPowerWatts: number;
  buildScore: number | null;
  scoreBreakdown: BuildScoreBreakdown | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedBuildItem {
  component: PCComponent;
  quantity: number;
  priceAtAdd: number;
}

export function mapBuildRow(row: BuildRow): SavedBuild {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    useCase: row.use_case,
    totalPrice: Number(row.total_price),
    totalPowerWatts: row.total_power_watts,
    buildScore: row.build_score,
    scoreBreakdown: (row.score_breakdown as BuildScoreBreakdown | null) ?? null,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentUserId(): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error(i18n.t('errors.signInToSave'));
  return data.user.id;
}

/** Make a slug unique by appending a short suffix on collision. */
async function uniqueSlug(base: string): Promise<string> {
  const client = requireSupabase();
  const root = slugify(base) || 'build';
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`;
    const { data } = await client.from('builds').select('id').eq('slug', candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export interface SaveBuildInput {
  name: string;
  description?: string;
  useCase: UseCase;
  isPublic?: boolean;
  components: PCComponent[];
  totalPrice: number;
  totalPowerWatts: number;
  buildScore: number;
  scoreBreakdown: BuildScoreBreakdown;
}

/** Insert a build + its items. Totals are also enforced by a DB trigger. */
export async function saveBuild(input: SaveBuildInput): Promise<SavedBuild> {
  const client = requireSupabase();
  const userId = await currentUserId();
  const slug = await uniqueSlug(input.name);

  const { data: build, error } = await client
    .from('builds')
    .insert({
      user_id: userId,
      name: input.name,
      slug,
      description: input.description ?? null,
      use_case: input.useCase,
      total_price: input.totalPrice,
      total_power_watts: input.totalPowerWatts,
      build_score: input.buildScore,
      // `score_breakdown` is JSONB; the Supabase Json type does not model the
      // structured shape, so this is the single documented boundary cast.
      score_breakdown:
        input.scoreBreakdown as unknown as Database['public']['Tables']['builds']['Insert']['score_breakdown'],
      is_public: input.isPublic ?? false,
    })
    .select()
    .single();

  if (error || !build)
    throw new Error(i18n.t('errors.saveFailed', { detail: error?.message ?? i18n.t('errors.unknown') }));

  if (input.components.length > 0) {
    const { error: itemsError } = await client.from('build_items').insert(
      input.components.map((component) => ({
        build_id: build.id,
        component_id: component.id,
        quantity: 1,
        price_at_add: component.price,
      })),
    );
    if (itemsError) {
      // Roll back the orphan header so a retry does not leave a duplicate.
      await client.from('builds').delete().eq('id', build.id);
      throw new Error(`Could not save the parts: ${itemsError.message}`);
    }
  }

  return mapBuildRow(build);
}

/** Load a build by slug with its parts (works for anonymous visitors). */
export async function getBuildBySlug(
  slug: string,
): Promise<{ build: SavedBuild; items: SavedBuildItem[] } | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: build, error } = await supabase.from('builds').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`Could not load the build: ${error.message}`);
  if (!build) return null;

  const { data: items, error: itemsError } = await supabase
    .from('build_items')
    .select('quantity, price_at_add, components(*)')
    .eq('build_id', build.id);
  if (itemsError) throw new Error(`Could not load the parts: ${itemsError.message}`);

  const mapped: SavedBuildItem[] = (items ?? [])
    .filter((row) => row.components)
    .map((row) => ({
      component: mapComponentRow(row.components as Database['public']['Tables']['components']['Row']),
      quantity: row.quantity,
      priceAtAdd: Number(row.price_at_add),
    }));

  return { build: mapBuildRow(build), items: mapped };
}

export async function listMyBuilds(): Promise<SavedBuild[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('builds').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load your builds: ${error.message}`);
  return (data ?? []).map(mapBuildRow);
}

export async function deleteBuild(id: string): Promise<void> {
  const { error } = await requireSupabase().from('builds').delete().eq('id', id);
  if (error) throw new Error(`Could not delete the build: ${error.message}`);
}

export async function setBuildVisibility(id: string, isPublic: boolean): Promise<void> {
  const { error } = await requireSupabase().from('builds').update({ is_public: isPublic }).eq('id', id);
  if (error) throw new Error(`Could not update visibility: ${error.message}`);
}

/* -------------------------------------------------------------------------- */
/*  Community                                                                 */
/* -------------------------------------------------------------------------- */

export interface CommunityPost {
  id: string;
  buildId: string;
  authorId: string;
  title: string;
  tags: string[];
  ratingAvg: number;
  ratingCount: number;
  views: number;
  publishedAt: string;
  build?: SavedBuild;
}

/** Publish a build. The DB trigger flips `is_public` and checks ownership. */
export async function publishBuild(buildId: string, title: string, tags: string[]): Promise<CommunityPost> {
  const client = requireSupabase();
  const userId = await currentUserId();

  const { data, error } = await client
    .from('community_builds')
    .insert({ build_id: buildId, author_id: userId, title, tags })
    .select()
    .single();

  if (error || !data) throw new Error(i18n.t('errors.publishFailed', { detail: error?.message ?? i18n.t('errors.unknown') }));

  return {
    id: data.id,
    buildId: data.build_id,
    authorId: data.author_id,
    title: data.title,
    tags: data.tags,
    ratingAvg: Number(data.rating_avg),
    ratingCount: data.rating_count,
    views: data.views,
    publishedAt: data.published_at,
  };
}

export async function listCommunityBuilds(): Promise<CommunityPost[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('community_builds')
    .select('*, builds(*)')
    .order('published_at', { ascending: false })
    .limit(24);
  if (error) throw new Error(`Could not load the community feed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    buildId: row.build_id,
    authorId: row.author_id,
    title: row.title,
    tags: row.tags,
    ratingAvg: Number(row.rating_avg),
    ratingCount: row.rating_count,
    views: row.views,
    publishedAt: row.published_at,
    build: row.builds ? mapBuildRow(row.builds as BuildRow) : undefined,
  }));
}

/** Upsert a 1â€“5 star rating; the trigger refreshes the aggregate. */
export async function rateBuild(communityBuildId: string, rating: number): Promise<void> {
  const client = requireSupabase();
  const userId = await currentUserId();
  const { error } = await client
    .from('build_ratings')
    .upsert(
      { community_build_id: communityBuildId, user_id: userId, rating: Math.max(1, Math.min(5, rating)) },
      { onConflict: 'community_build_id,user_id' },
    );
  if (error) throw new Error(`Could not save your rating: ${error.message}`);
}

export async function getMyRating(communityBuildId: string): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase
    .from('build_ratings')
    .select('rating')
    .eq('community_build_id', communityBuildId)
    .maybeSingle();
  return data?.rating ?? null;
}

export async function incrementViews(communityBuildId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  // Fire-and-forget: a failed view count must never block the page.
  await supabase.rpc('increment_build_view', { target_build: communityBuildId }).then(
    () => undefined,
    () => undefined,
  );
}

/* -------------------------------------------------------------------------- */
/*  Alerts                                                                    */
/* -------------------------------------------------------------------------- */

export type AlertType = 'price_drop' | 'back_in_stock';

export interface SavedAlert {
  id: string;
  componentId: string;
  alertType: AlertType;
  targetPrice: number | null;
  isActive: boolean;
  createdAt: string;
}

export async function createAlert(input: {
  componentId: string;
  alertType: AlertType;
  targetPrice?: number | null;
}): Promise<SavedAlert> {
  const userId = await currentUserId();
  const { data, error } = await requireSupabase()
    .from('saved_alerts')
    .upsert(
      {
        user_id: userId,
        component_id: input.componentId,
        alert_type: input.alertType,
        target_price: input.targetPrice ?? null,
      },
      { onConflict: 'user_id,component_id,alert_type' },
    )
    .select()
    .single();

  if (error || !data) throw new Error(i18n.t('errors.alertFailed', { detail: error?.message ?? i18n.t('errors.unknown') }));

  return {
    id: data.id,
    componentId: data.component_id,
    alertType: data.alert_type as AlertType,
    targetPrice: data.target_price,
    isActive: data.is_active,
    createdAt: data.created_at,
  };
}

export async function listAlerts(): Promise<SavedAlert[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('saved_alerts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load alerts: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    componentId: row.component_id,
    alertType: row.alert_type as AlertType,
    targetPrice: row.target_price,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}

export async function deleteAlert(id: string): Promise<void> {
  const { error } = await requireSupabase().from('saved_alerts').delete().eq('id', id);
  if (error) throw new Error(`Could not remove the alert: ${error.message}`);
}
