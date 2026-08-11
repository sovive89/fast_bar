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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
      fastbar_products: {
        Row: {
          category: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          package_type: string | null
          price: number
          stock_quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          package_type?: string | null
          price?: number
          stock_quantity?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          package_type?: string | null
          price?: number
          stock_quantity?: number
          unit?: string
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
          closed_at: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          id: string
          paid_at: string | null
          payment_method: string | null
          phone: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          phone: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
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
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type?: string
          note?: string | null
          product_id: string
          quantity: number
          session_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          note?: string | null
          product_id?: string
          quantity?: number
          session_id?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
