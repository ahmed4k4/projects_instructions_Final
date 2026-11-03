/**
 * Persistence for builds, community publishing, ratings and alerts.
 *
 * Every function is a thin, typed wrapper over Supabase with RLS doing the
 * authorisation. Mapping follows the same snake_case → camelCase convention as
 * `componentsService`.
 */
import type { PCComponent } from '@/types/components';
import type { BuildScoreBreakdown, UseCase } from '@/types/build';
import type { Database } from '@/types/database';
import { isSupabaseConfigured, requireSupabase, supabase } from './supabaseClient';
import { loadCatalogue } from '@/hooks/useComponents';
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

function mapBuildRow(row: BuildRow): SavedBuild {
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

/**
 * Load a build by slug with its parts (works for anonymous visitors).
 *
 * ── Phase 15: what a saved build's parts are ───────────────────────────────
 * `build_items.component_id` points at the legacy `components` table — the shape
 * users saved before the catalogue moved to real retailer listings. Two things
 * happen here now, in order:
 *
 *   1. try the legacy id (a build saved by an older deploy still resolves);
 *   2. otherwise fall back to a SKU match against the live catalogue by name, so
 *      a build saved today — whose id is `sku:gpu:asus:geforce|5070|12` — opens
 *      with the parts it was built from.
 *
 * The fallback keeps the Build Doctor (and "Open in builder") useful for every
 * build, instead of rendering an empty page for anything saved after the move.
 */
export async function getBuildBySlug(slug: string): Promise<{ build: SavedBuild; items: SavedBuildItem[] } | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: build, error } = await supabase.from('builds').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`Could not load the build: ${error.message}`);
  if (!build) return null;

  const { data: items, error: itemsError } = await supabase
    .from('build_items')
    .select('quantity, price_at_add, components(*)')
    .eq('build_id', build.id);
  if (itemsError) throw new Error(`Could not load the parts: ${itemsError.message}`);

  let catalogue: PCComponent[] | null = null;
  const loadCatalogueOnce = async (): Promise<PCComponent[]> => {
    catalogue ??= await loadCatalogue();
    return catalogue;
  };

  const mapped: SavedBuildItem[] = [];
  for (const row of items ?? []) {
    if (row.components) {
      /**
       * A build saved BEFORE Phase 15 stores a `components` row — a part from
       * the retired seed catalogue. It is rendered from the row itself (spec,
       * price, name) rather than re-resolved against live stock, because the id
       * no longer exists and pretending it does would drop the part silently.
       */
      const legacy = row.components as Database['public']['Tables']['components']['Row'];
      mapped.push({
        component: {
          id: legacy.id,
          category: legacy.category,
          brand: legacy.brand,
          model: legacy.model,
          name: legacy.name,
          nameAr: legacy.name_ar,
          specs: (legacy.specs ?? {}) as Record<string, unknown>,
          price: Number(legacy.price),
          currency: legacy.currency,
          // Legacy seed rows have no current retailer observation; never infer stock from them.
          stockStatus: 'unknown',
          storeLinks: [],
          performanceScore: legacy.performance_score,
          powerDrawWatts: legacy.power_draw_watts,
          imageUrl: legacy.image_url,
          isActive: false,
          createdAt: legacy.created_at,
          updatedAt: legacy.updated_at,
        },
        quantity: row.quantity,
        priceAtAdd: Number(row.price_at_add),
      });
      continue;
    }

    // A listing-based build: resolve the saved id (or name) against live stock.
    const savedId = String((row as { component_id?: string | null }).component_id ?? '');
    const savedName = String((row as { component_name?: string | null }).component_name ?? '');
    const live = await loadCatalogueOnce();
    const component =
      live.find((entry) => entry.id === savedId) ??
      (savedName ? findByName(live, savedName) : undefined) ??
      live.find((entry) => entry.name === savedId);

    if (!component) continue;
    mapped.push({ component, quantity: row.quantity, priceAtAdd: Number(row.price_at_add) });
  }

  return { build: mapBuildRow(build), items: mapped };
}

/** Case-insensitive exact-ish name match (a saved build's part still exists). */
function findByName(catalogue: PCComponent[], name: string): PCComponent | undefined {
  const needle = name.trim().toLowerCase();
  return catalogue.find((entry) => entry.name.toLowerCase() === needle);
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

/**
 * Builds the Community page can read.
 *
 * Removed in an earlier cleanup as "unused", which was wrong once Community was
 * pointed at the database: without it the page had no real source and rendered
 * curated demo builds with no indication they were samples.
 *
 * Returns `null` — not `[]` — when the database is unavailable. The caller needs
 * to distinguish "nobody has published yet" (show an empty state) from "there is
 * no database here" (show labelled demo data).
 */
export async function listCommunityBuilds(limit = 24): Promise<SavedBuild[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from('builds')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return null;
  return ((data ?? []) as BuildRow[]).map(mapBuildRow);
}

/**
 * The signed-in user's own builds.
 *
 * `null` when there is no database or no session — the dashboard shows its local
 * workspace in that case, rather than pretending to have cloud data.
 */
export async function listMyBuilds(limit = 24): Promise<SavedBuild[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('builds')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) return null;
  return ((data ?? []) as BuildRow[]).map(mapBuildRow);
}
