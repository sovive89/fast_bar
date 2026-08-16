export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      bar_products: {
        Row: {
          active: boolean | null
          brand: string | null
          category: string
          cost_price: number | null
          created_at: string | null
          id: string
          name: string
          sale_price: number | null
          stock_type: string
          updated_at: string | null
          volume_ml: number | null
        }
        Insert: {
          active?: boolean | null
          brand?: string | null
          category: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          name: string
          sale_price?: number | null
          stock_type: string
          updated_at?: string | null
          volume_ml?: number | null
        }
        Update: {
          active?: boolean | null
          brand?: string | null
          category?: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          name?: string
          sale_price?: number | null
          stock_type?: string
          updated_at?: string | null
          volume_ml?: number | null
        }
        Relationships: []
      }
      bar_sessions: {
        Row: {
          closed_at: string | null
          created_at: string | null
          customer_name: string
          id: string
          opened_at: string
          phone: string
          status: string
          updated_at: string | null
          verification_code: string | null
          verification_status: boolean | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          customer_name: string
          id?: string
          opened_at?: string
          phone: string
          status?: string
          updated_at?: string | null
          verification_code?: string | null
          verification_status?: boolean | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          customer_name?: string
          id?: string
          opened_at?: string
          phone?: string
          status?: string
          updated_at?: string | null
          verification_code?: string | null
          verification_status?: boolean | null
        }
        Relationships: []
      }
      bar_tab_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          launched_at: string | null
          product_id: string | null
          quantity: number | null
          session_id: string
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          launched_at?: string | null
          product_id?: string | null
          quantity?: number | null
          session_id: string
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          launched_at?: string | null
          product_id?: string | null
          quantity?: number | null
          session_id?: string
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_tab_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bar_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_tab_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_base_drink_movements: {
        Row: {
          base_drink_id: string
          created_at: string
          id: string
          note: string | null
          quantity: number
          reason: string
          supplier_id: string | null
          type: string
          unit_cost: number | null
        }
        Insert: {
          base_drink_id: string
          created_at?: string
          id?: string
          note?: string | null
          quantity: number
          reason?: string
          supplier_id?: string | null
          type: string
          unit_cost?: number | null
        }
        Update: {
          base_drink_id?: string
          created_at?: string
          id?: string
          note?: string | null
          quantity?: number
          reason?: string
          supplier_id?: string | null
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_base_drink_movements_base_drink_id_fkey"
            columns: ["base_drink_id"]
            isOneToOne: false
            referencedRelation: "fastbar_base_drinks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_base_drink_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "fastbar_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_base_drinks: {
        Row: {
          active: boolean
          average_cost: number
          content_amount: number
          created_at: string
          current_stock: number
          id: string
          min_stock: number
          name: string
          purchase_unit: string | null
          unit: string
          units_per_pack: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          average_cost?: number
          content_amount?: number
          created_at?: string
          current_stock?: number
          id?: string
          min_stock?: number
          name: string
          purchase_unit?: string | null
          unit?: string
          units_per_pack?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          average_cost?: number
          content_amount?: number
          created_at?: string
          current_stock?: number
          id?: string
          min_stock?: number
          name?: string
          purchase_unit?: string | null
          unit?: string
          units_per_pack?: number
          updated_at?: string
        }
        Relationships: []
      }
      fastbar_customers: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          name: string
          notes: string | null
          phone: string
          total_spent: number
          total_visits: number
          full_name: string | null
          birthday_day: number | null
          birthday_month: number | null
          administrative_region: string | null
          how_found_out: string | null
          age_range: string | null
          profession: string | null
          favorite_music_genre: string | null
          marketing_opt_in: boolean
          profile_completed_at: string | null
          welcome_discount_earned_at: string | null
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          name: string
          notes?: string | null
          phone: string
          total_spent?: number
          total_visits?: number
          full_name?: string | null
          birthday_day?: number | null
          birthday_month?: number | null
          administrative_region?: string | null
          how_found_out?: string | null
          age_range?: string | null
          profession?: string | null
          favorite_music_genre?: string | null
          marketing_opt_in?: boolean
          profile_completed_at?: string | null
          welcome_discount_earned_at?: string | null
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          name?: string
          notes?: string | null
          phone?: string
          total_spent?: number
          total_visits?: number
          full_name?: string | null
          birthday_day?: number | null
          birthday_month?: number | null
          administrative_region?: string | null
          how_found_out?: string | null
          age_range?: string | null
          profession?: string | null
          favorite_music_genre?: string | null
          marketing_opt_in?: boolean
          profile_completed_at?: string | null
          welcome_discount_earned_at?: string | null
        }
        Relationships: []
      }
      fastbar_drink_ingredient_movements: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          note: string | null
          quantity: number
          reason: string
          supplier_id: string | null
          type: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          note?: string | null
          quantity: number
          reason?: string
          supplier_id?: string | null
          type: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          note?: string | null
          quantity?: number
          reason?: string
          supplier_id?: string | null
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_drink_ingredient_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "fastbar_drink_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_drink_ingredient_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "fastbar_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_drink_ingredients: {
        Row: {
          active: boolean
          average_cost: number
          content_amount: number
          created_at: string
          current_stock: number
          id: string
          min_stock: number
          name: string
          purchase_unit: string | null
          unit: string
          units_per_pack: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          average_cost?: number
          content_amount?: number
          created_at?: string
          current_stock?: number
          id?: string
          min_stock?: number
          name: string
          purchase_unit?: string | null
          unit?: string
          units_per_pack?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          average_cost?: number
          content_amount?: number
          created_at?: string
          current_stock?: number
          id?: string
          min_stock?: number
          name?: string
          purchase_unit?: string | null
          unit?: string
          units_per_pack?: number
          updated_at?: string
        }
        Relationships: []
      }
      fastbar_product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      fastbar_products: {
        Row: {
          average_cost: number
          category: string
          content_amount: number
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          package_type: string | null
          price: number
          purchase_unit: string | null
          stock_quantity: number
          unit: string
          units_per_pack: number
          updated_at: string
        }
        Insert: {
          average_cost?: number
          category?: string
          content_amount?: number
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          package_type?: string | null
          price?: number
          purchase_unit?: string | null
          stock_quantity?: number
          unit?: string
          units_per_pack?: number
          updated_at?: string
        }
        Update: {
          average_cost?: number
          category?: string
          content_amount?: number
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          package_type?: string | null
          price?: number
          purchase_unit?: string | null
          stock_quantity?: number
          unit?: string
          units_per_pack?: number
          updated_at?: string
        }
        Relationships: []
      }
      fastbar_recipe_items: {
        Row: {
          base_drink_id: string | null
          id: string
          ingredient_id: string | null
          product_id: string
          quantity: number
        }
        Insert: {
          base_drink_id?: string | null
          id?: string
          ingredient_id?: string | null
          product_id: string
          quantity: number
        }
        Update: {
          base_drink_id?: string | null
          id?: string
          ingredient_id?: string | null
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_recipe_items_base_drink_id_fkey"
            columns: ["base_drink_id"]
            isOneToOne: false
            referencedRelation: "fastbar_base_drinks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_recipe_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "fastbar_drink_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_recipe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fastbar_products"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_sessions: {
        Row: {
          archived_at: string | null
          closed_at: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          discount_percent: number
          id: string
          paid_at: string | null
          payment_method: string | null
          phone: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          discount_percent?: number
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          phone: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          discount_percent?: number
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          phone?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "fastbar_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string
          note: string | null
          product_id: string
          quantity: number
          session_id: string | null
          supplier_id: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type?: string
          note?: string | null
          product_id: string
          quantity: number
          session_id?: string | null
          supplier_id?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          note?: string | null
          product_id?: string
          quantity?: number
          session_id?: string | null
          supplier_id?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fastbar_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_stock_movements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fastbar_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_stock_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "fastbar_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_suppliers: {
        Row: {
          active: boolean
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      fastbar_tab_items: {
        Row: {
          added_at: string
          id: string
          name: string
          product_id: string | null
          quantity: number
          session_id: string
          unit_price: number
        }
        Insert: {
          added_at?: string
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          session_id: string
          unit_price?: number
        }
        Update: {
          added_at?: string
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          session_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_tab_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fastbar_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_tab_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fastbar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string | null
          id: string
          movement_type: string
          observation: string | null
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          movement_type: string
          observation?: string | null
          product_id: string
          quantity: number
        }
        Update: {
          created_at?: string | null
          id?: string
          movement_type?: string
          observation?: string | null
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bar_products"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_items: {
        Row: {
          added_at: string
          id: string
          name: string
          quantity: number
          tab_id: string
          unit_price: number
        }
        Insert: {
          added_at?: string
          id?: string
          name: string
          quantity?: number
          tab_id: string
          unit_price?: number
        }
        Update: {
          added_at?: string
          id?: string
          name?: string
          quantity?: number
          tab_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_items_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      tabs: {
        Row: {
          closed_at: string | null
          created_at: string
          customer_name: string
          id: string
          paid_at: string | null
          phone: string
          started_at: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          customer_name: string
          id?: string
          paid_at?: string | null
          phone: string
          started_at?: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          paid_at?: string | null
          phone?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fastbar_add_product_entry: {
        Args: {
          p_packs: number
          p_product_id: string
          p_purchase_cost?: number
          p_supplier_id?: string
        }
        Returns: Json
      }
      fastbar_add_tab_item: {
        Args: { p_product_id: string; p_session_id: string }
        Returns: Json
      }
      fastbar_apply_sale_stock: {
        Args: { p_product_id: string; p_quantity: number; p_session_id: string }
        Returns: undefined
      }
      fastbar_cancel_session: { Args: { p_session_id: string }; Returns: Json }
      fastbar_clear_tab_items: { Args: { p_session_id: string }; Returns: Json }
      fastbar_delete_base_drink: { Args: { p_id: string }; Returns: Json }
      fastbar_delete_ingredient: { Args: { p_id: string }; Returns: Json }
      fastbar_delete_product: { Args: { p_product_id: string }; Returns: Json }
      fastbar_delete_product_category: { Args: { p_id: string }; Returns: Json }
      fastbar_create_product: {
        Args: {
          p_name: string
          p_price: number
          p_category: string
          p_unit: string
          p_package_type: string | null
          p_image_url: string | null
          p_initial_stock: number
        }
        Returns: Json
      }
      fastbar_update_product: {
        Args: {
          p_id: string
          p_name: string
          p_price: number
          p_category: string
          p_unit: string
          p_package_type: string | null
          p_image_url: string | null
          p_change_image: boolean
        }
        Returns: Json
      }
      fastbar_update_product_category: { Args: { p_id: string; p_name: string }; Returns: Json }
      fastbar_remove_tab_item: { Args: { p_item_id: string }; Returns: Json }
      fastbar_restock_product: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: Json
      }
      fastbar_revert_item_stock: {
        Args: { p_product_id: string; p_quantity: number; p_session_id: string }
        Returns: undefined
      }
      fastbar_undo_last_tab_item: {
        Args: { p_session_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
