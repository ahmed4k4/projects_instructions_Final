/**
 * Supabase-style generated types (hand-written in the shape `supabase gen
 * types` emits) so the client is fully typed before the project is linked.
 * Regenerate with:
 *   supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ComponentCategoryDb =
  'cpu' | 'gpu' | 'motherboard' | 'ram' | 'storage' | 'psu' | 'case' | 'cooling';

export interface Database {
  public: {
    Tables: {
      components: {
        Row: {
          id: string;
          category: ComponentCategoryDb;
          brand: string;
          model: string;
          name: string;
          specs: Json;
          price: number;
          currency: string;
          stock_status: string;
          store_links: Json;
          performance_score: number | null;
          power_draw_watts: number | null;
          image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category: ComponentCategoryDb;
          brand: string;
          model: string;
          name: string;
          specs?: Json;
          price: number;
          currency?: string;
          stock_status?: string;
          store_links?: Json;
          performance_score?: number | null;
          power_draw_watts?: number | null;
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['components']['Insert']>;
        Relationships: [];
      };
      compatibility_rules: {
        Row: {
          id: string;
          rule_key: string;
          category_a: ComponentCategoryDb;
          category_b: ComponentCategoryDb;
          rule_type: 'match' | 'min' | 'max' | 'formfactor' | 'custom';
          spec_path_a: string;
          spec_path_b: string;
          config: Json;
          message: string;
          severity: 'error' | 'warning';
          created_at: string;
        };
        Insert: {
          id?: string;
          rule_key: string;
          category_a: ComponentCategoryDb;
          category_b: ComponentCategoryDb;
          rule_type: 'match' | 'min' | 'max' | 'formfactor' | 'custom';
          spec_path_a: string;
          spec_path_b: string;
          config?: Json;
          message: string;
          severity?: 'error' | 'warning';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['compatibility_rules']['Insert']>;
        Relationships: [];
      };
      builds: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          use_case: string | null;
          total_price: number;
          total_power_watts: number;
          build_score: number | null;
          score_breakdown: Json;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          use_case?: string | null;
          total_price?: number;
          total_power_watts?: number;
          build_score?: number | null;
          score_breakdown?: Json;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['builds']['Insert']>;
        Relationships: [];
      };
      build_items: {
        Row: {
          id: string;
          build_id: string;
          component_id: string;
          quantity: number;
          price_at_add: number;
        };
        Insert: {
          id?: string;
          build_id: string;
          component_id: string;
          quantity?: number;
          price_at_add: number;
        };
        Update: Partial<Database['public']['Tables']['build_items']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'build_items_component_id_fkey';
            columns: ['component_id'];
            isOneToOne: false;
            referencedRelation: 'components';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'build_items_build_id_fkey';
            columns: ['build_id'];
            isOneToOne: false;
            referencedRelation: 'builds';
            referencedColumns: ['id'];
          },
        ];
      };
      saved_alerts: {
        Row: {
          id: string;
          user_id: string;
          component_id: string;
          alert_type: 'price_drop' | 'back_in_stock';
          target_price: number | null;
          is_active: boolean;
          triggered_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          component_id: string;
          alert_type: 'price_drop' | 'back_in_stock';
          target_price?: number | null;
          is_active?: boolean;
          triggered_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['saved_alerts']['Insert']>;
        Relationships: [];
      };
      community_builds: {
        Row: {
          id: string;
          build_id: string;
          author_id: string;
          title: string;
          tags: string[];
          rating_avg: number;
          rating_count: number;
          views: number;
          published_at: string;
        };
        Insert: {
          id?: string;
          build_id: string;
          author_id: string;
          title: string;
          tags?: string[];
          rating_avg?: number;
          rating_count?: number;
          views?: number;
          published_at?: string;
        };
        Update: Partial<Database['public']['Tables']['community_builds']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'community_builds_build_id_fkey',
            columns: ['build_id'],
            isOneToOne: true,
            referencedRelation: 'builds',
            referencedColumns: ['id'],
          },
        ],
      };
      fps_benchmarks: {
        Row: {
          id: string;
          gpu_model: string;
          game_title: string;
          resolution: string;
          quality_preset: string;
          fps_avg: number;
          cpu_test_used: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          gpu_model: string;
          game_title: string;
          resolution: string;
          quality_preset?: string;
          fps_avg: number;
          cpu_test_used?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['fps_benchmarks']['Insert']>;
        Relationships: [];
      };
      ai_fps_estimates: {
        Row: {
          id: string;
          gpu_model: string;
          game_title: string;
          resolution: string;
          quality_preset: string;
          fps_avg: number;
          model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          gpu_model: string;
          game_title: string;
          resolution: string;
          quality_preset?: string;
          fps_avg: number;
          model?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['ai_fps_estimates']['Insert']>;
        Relationships: [];
      };
      ai_usage: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['ai_usage']['Insert']>;
        Relationships: [];
      };
      chat_sessions: {
        Row: {
          id: string;
          user_id: string;
          build_id: string | null;
          title: string;
          scope: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          build_id?: string | null;
          title?: string;
          scope?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_sessions']['Insert']>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: string;
          content: string;
          citations: Json;
          tool_trace: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: string;
          content: string;
          citations?: Json;
          tool_trace?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>;
        Relationships: [];
      };
      build_ratings: {
        Row: {
          id: string;
          community_build_id: string;
          user_id: string;
          rating: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          community_build_id: string;
          user_id: string;
          rating: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['build_ratings']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      increment_build_view: {
        Args: { target_build: string };
        Returns: void;
      };
    };
    Enums: {
      component_category: ComponentCategoryDb;
    };
    CompositeTypes: Record<never, never>;
  };
}
