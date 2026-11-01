/**
 * When should a question use Google Search grounding?
 *
 * Grounding costs a small, separate daily quota (~500), so it must be applied
 * deliberately. Two rules:
 *
 *   1. Internal build logic NEVER grounds: compatibility, scoring and FPS come
 *      from the local engines and the catalogue, and a search result must not
 *      be able to contradict them.
 *   2. Only questions about *current facts* ground: prices, stock, availability
 *      and recent releases.
 */
import type { PromptLocale } from '@/services/prompts/buildGenerator';

/** English + Arabic markers for live-data questions. */
const PRICE = [/\b(price|cost|how much|cheaper|expensive|msrp)\b/i, /(سعر|أسعار|بكم|أرخص|أغلى)/];

const STOCK = [
  /\b(in stock|available|availability|sold out|restock|where to buy)\b/i,
  /(متوفر|متاح|نفد|المخزون|شراء)/,
];

const RELEASE = [
  /\b(released|release date|newest|latest|this year)\b/i,
  /(صدر|إصدار|أحدث|جديد|هذا العام)/,
];

/** The assistant must never be asked to invent numbers the engines own. */
const INTERNAL_ONLY = [
  /\b(compatib|score|bottleneck|efficien)\b/i,
  /(توافق|التقييم|عنق الزجاجة|الكفاءة)/,
];

export interface GroundingDecision {
  grounded: boolean;
  /** Why — shown in the UI tooltip so the behaviour is explainable. */
  reason: 'price' | 'stock' | 'release' | 'internal' | 'none';
}

/** Decide whether a user question should use Google Search grounding. */
export function shouldGround(question: string): GroundingDecision {
  if (INTERNAL_ONLY.some((re) => re.test(question))) {
    return { grounded: false, reason: 'internal' };
  }
  if (PRICE.some((re) => re.test(question))) return { grounded: true, reason: 'price' };
  if (STOCK.some((re) => re.test(question))) return { grounded: true, reason: 'stock' };
  if (RELEASE.some((re) => re.test(question))) return { grounded: true, reason: 'release' };
  return { grounded: false, reason: 'none' };
}

/**
 * Extra instruction for grounded requests: how to treat search results, and that
 * catalogue data still wins for the user's own build.
 */
export function groundingInstruction(locale: PromptLocale): string {
  return locale === 'ar'
    ? 'عند استخدام نتائج البحث الحيّة: اذكر أن الأسعار والتوفّر يتغيّران، وأشر إلى المصدر. وإذا تعارضت نتيجة البحث مع بيانات الكتالوج للتجميعة (السعر والتوافق والتقييم) فبيانات الكتالوج هي المرجع، ونبّه المستخدم إلى الفارق.'
    : "When using live search results: state that prices and availability change, and cite the source. If a search result conflicts with the catalogue data for the user's own build (catalogue price, compatibility, score), the catalogue wins — and tell the user about the discrepancy.";
}
