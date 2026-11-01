import type { PCComponent, StoreLink } from '@/types/components';
import type { Database } from '@/types/database';
import type { ComponentCategoryDb } from '@/types/database';
import { supabase } from './supabaseClient';

type ComponentRow = Database['public']['Tables']['components']['Row'];
type RuleRow = Database['public']['Tables']['compatibility_rules']['Row'];

/** Map a snake_case database row to the camelCase domain model. */
export function mapComponentRow(row: ComponentRow): PCComponent {
  const storeLinks = Array.isArray(row.store_links) ? (row.store_links as unknown as StoreLink[]) : [];

  return {
    id: row.id,
    category: row.category,
    brand: row.brand,
    model: row.model,
    name: row.name,
    nameAr: row.name_ar,
    descriptionAr: row.description_ar,
    specs: (row.specs ?? {}) as Record<string, unknown>,
    price: Number(row.price),
    currency: row.currency,
    stockStatus: (row.stock_status as PCComponent['stockStatus']) ?? 'in_stock',
    storeLinks,
    performanceScore: row.performance_score,
    powerDrawWatts: row.power_draw_watts,
    imageUrl: row.image_url,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List active components, optionally filtered by category.
 * Throws a readable error when Supabase has not been configured yet.
 */
export async function listComponents(category?: ComponentCategoryDb): Promise<PCComponent[]> {
  if (!supabase) return [];

  let query = supabase
    .from('components')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load components: ${error.message}`);
  return (data ?? []).map(mapComponentRow);
}

export async function getComponentById(id: string): Promise<PCComponent | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.from('components').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load component ${id}: ${error.message}`);
  return data ? mapComponentRow(data) : null;
}

export async function getCompatibilityRules(): Promise<RuleRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.from('compatibility_rules').select('*').order('rule_key');
  if (error) throw new Error(`Failed to load compatibility rules: ${error.message}`);
  return data ?? [];
}
