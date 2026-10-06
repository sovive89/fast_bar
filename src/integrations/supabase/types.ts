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
    PostgrestVersion: "14.5"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "fastbar_base_drink_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
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
          depletion_rule: string
          id: string
          image_url: string | null
          min_stock: number
          name: string
          purchase_unit: string | null
          tenant_id: string
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
          depletion_rule?: string
          id?: string
          image_url?: string | null
          min_stock?: number
          name: string
          purchase_unit?: string | null
          tenant_id?: string
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
          depletion_rule?: string
          id?: string
          image_url?: string | null
          min_stock?: number
          name?: string
          purchase_unit?: string | null
          tenant_id?: string
          unit?: string
          units_per_pack?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_base_drinks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_consumable_movements: {
        Row: {
          consumable_id: string
          created_at: string
          id: string
          note: string | null
          quantity: number
          reason: string
          supplier_id: string | null
          tenant_id: string
          type: string
          unit_cost: number | null
        }
        Insert: {
          consumable_id: string
          created_at?: string
          id?: string
          note?: string | null
          quantity: number
          reason?: string
          supplier_id?: string | null
          tenant_id?: string
          type: string
          unit_cost?: number | null
        }
        Update: {
          consumable_id?: string
          created_at?: string
          id?: string
          note?: string | null
          quantity?: number
          reason?: string
          supplier_id?: string | null
          tenant_id?: string
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_consumable_movements_consumable_id_fkey"
            columns: ["consumable_id"]
            isOneToOne: false
            referencedRelation: "fastbar_consumables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_consumable_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "fastbar_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_consumables: {
        Row: {
          active: boolean
          average_cost: number
          content_amount: number
          created_at: string
          current_stock: number
          depletion_rule: string
          id: string
          image_url: string | null
          min_stock: number
          name: string
          purchase_unit: string | null
          tenant_id: string
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
          depletion_rule?: string
          id?: string
          image_url?: string | null
          min_stock?: number
          name: string
          purchase_unit?: string | null
          tenant_id?: string
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
          depletion_rule?: string
          id?: string
          image_url?: string | null
          min_stock?: number
          name?: string
          purchase_unit?: string | null
          tenant_id?: string
          unit?: string
          units_per_pack?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_consumables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_customers: {
        Row: {
          administrative_region: string | null
          age_range: string | null
          birthday_day: number | null
          birthday_month: number | null
          created_at: string
          document: string | null
          document_type: string | null
          favorite_music_genre: string | null
          first_seen_at: string
          full_name: string | null
          how_found_out: string | null
          id: string
          last_seen_at: string
          marketing_opt_in: boolean
          name: string
          notes: string | null
          phone: string | null
          phone_verified: boolean
          phone_verified_at: string | null
          profession: string | null
          profile_completed_at: string | null
          tenant_id: string
          total_spent: number
          total_visits: number
          welcome_discount_earned_at: string | null
        }
        Insert: {
          administrative_region?: string | null
          age_range?: string | null
          birthday_day?: number | null
          birthday_month?: number | null
          created_at?: string
          document?: string | null
          document_type?: string | null
          favorite_music_genre?: string | null
          first_seen_at?: string
          full_name?: string | null
          how_found_out?: string | null
          id?: string
          last_seen_at?: string
          marketing_opt_in?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          profession?: string | null
          profile_completed_at?: string | null
          tenant_id?: string
          total_spent?: number
          total_visits?: number
          welcome_discount_earned_at?: string | null
        }
        Update: {
          administrative_region?: string | null
          age_range?: string | null
          birthday_day?: number | null
          birthday_month?: number | null
          created_at?: string
          document?: string | null
          document_type?: string | null
          favorite_music_genre?: string | null
          first_seen_at?: string
          full_name?: string | null
          how_found_out?: string | null
          id?: string
          last_seen_at?: string
          marketing_opt_in?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          profession?: string | null
          profile_completed_at?: string | null
          tenant_id?: string
          total_spent?: number
          total_visits?: number
          welcome_discount_earned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "fastbar_drink_ingredient_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
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
          depletion_rule: string
          id: string
          image_url: string | null
          kind: string
          min_stock: number
          name: string
          purchase_unit: string | null
          tenant_id: string
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
          depletion_rule?: string
          id?: string
          image_url?: string | null
          kind?: string
          min_stock?: number
          name: string
          purchase_unit?: string | null
          tenant_id?: string
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
          depletion_rule?: string
          id?: string
          image_url?: string | null
          kind?: string
          min_stock?: number
          name?: string
          purchase_unit?: string | null
          tenant_id?: string
          unit?: string
          units_per_pack?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_drink_ingredients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_integrations: {
        Row: {
          config: Json
          enabled: boolean
          key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          enabled?: boolean
          key: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          enabled?: boolean
          key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_notas_importadas: {
        Row: {
          chave_acesso: string
          created_at: string
          emitente_documento: string | null
          emitente_nome: string | null
          id: string
          itens_importados: number
          tenant_id: string
          todos_itens_ok: boolean | null
          uf: string | null
          valor_total: number | null
        }
        Insert: {
          chave_acesso: string
          created_at?: string
          emitente_documento?: string | null
          emitente_nome?: string | null
          id?: string
          itens_importados?: number
          tenant_id?: string
          todos_itens_ok?: boolean | null
          uf?: string | null
          valor_total?: number | null
        }
        Update: {
          chave_acesso?: string
          created_at?: string
          emitente_documento?: string | null
          emitente_nome?: string | null
          id?: string
          itens_importados?: number
          tenant_id?: string
          todos_itens_ok?: boolean | null
          uf?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_notas_importadas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_operations: {
        Row: {
          aberto_em: string
          aberto_por: string
          created_at: string
          data_operacional: string
          fechado_em: string | null
          fechado_por: string | null
          fim_operacional: string | null
          id: string
          inicio_operacional: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          aberto_em?: string
          aberto_por?: string
          created_at?: string
          data_operacional: string
          fechado_em?: string | null
          fechado_por?: string | null
          fim_operacional?: string | null
          id?: string
          inicio_operacional: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          aberto_em?: string
          aberto_por?: string
          created_at?: string
          data_operacional?: string
          fechado_em?: string | null
          fechado_por?: string | null
          fim_operacional?: string | null
          id?: string
          inicio_operacional?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      fastbar_product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          needs_recipe: boolean
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          needs_recipe?: boolean
          tenant_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          needs_recipe?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_product_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_products: {
        Row: {
          average_cost: number
          campo_estoque: string | null
          category: string
          content_amount: number
          created_at: string
          depletion_rule: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          package_type: string | null
          price: number
          purchase_unit: string | null
          stock_quantity: number
          tenant_id: string
          unit: string
          units_per_pack: number
          unlimited_stock: boolean
          updated_at: string
        }
        Insert: {
          average_cost?: number
          campo_estoque?: string | null
          category?: string
          content_amount?: number
          created_at?: string
          depletion_rule?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          package_type?: string | null
          price?: number
          purchase_unit?: string | null
          stock_quantity?: number
          tenant_id?: string
          unit?: string
          units_per_pack?: number
          unlimited_stock?: boolean
          updated_at?: string
        }
        Update: {
          average_cost?: number
          campo_estoque?: string | null
          category?: string
          content_amount?: number
          created_at?: string
          depletion_rule?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          package_type?: string | null
          price?: number
          purchase_unit?: string | null
          stock_quantity?: number
          tenant_id?: string
          unit?: string
          units_per_pack?: number
          unlimited_stock?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_recipe_items: {
        Row: {
          base_drink_id: string | null
          id: string
          ingredient_id: string | null
          product_id: string
          quantity: number
          tenant_id: string
        }
        Insert: {
          base_drink_id?: string | null
          id?: string
          ingredient_id?: string | null
          product_id: string
          quantity: number
          tenant_id?: string
        }
        Update: {
          base_drink_id?: string | null
          id?: string
          ingredient_id?: string | null
          product_id?: string
          quantity?: number
          tenant_id?: string
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
          {
            foreignKeyName: "fastbar_recipe_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_sessions: {
        Row: {
          archived_at: string | null
          channel: string | null
          closed_at: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          data_operacional: string | null
          discount_percent: number
          document: string | null
          document_type: string | null
          id: string
          operacao_id: string | null
          paid_at: string | null
          payment_method: string | null
          phone: string | null
          pos_amount: number | null
          pos_order_id: string | null
          pos_paid_order_id: string | null
          pos_refunded_at: string | null
          pos_requested_at: string | null
          service_fee_percent: number
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          channel?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          data_operacional?: string | null
          discount_percent?: number
          document?: string | null
          document_type?: string | null
          id?: string
          operacao_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          phone?: string | null
          pos_amount?: number | null
          pos_order_id?: string | null
          pos_paid_order_id?: string | null
          pos_refunded_at?: string | null
          pos_requested_at?: string | null
          service_fee_percent?: number
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          channel?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          data_operacional?: string | null
          discount_percent?: number
          document?: string | null
          document_type?: string | null
          id?: string
          operacao_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          phone?: string | null
          pos_amount?: number | null
          pos_order_id?: string | null
          pos_paid_order_id?: string | null
          pos_refunded_at?: string | null
          pos_requested_at?: string | null
          service_fee_percent?: number
          started_at?: string | null
          status?: string
          tenant_id?: string
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
          {
            foreignKeyName: "fastbar_sessions_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "fastbar_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_stock_lots: {
        Row: {
          chave_acesso: string | null
          component_id: string
          component_kind: string
          created_at: string
          documento_emissao: string | null
          documento_numero: string | null
          documento_serie: string | null
          documento_tipo: string
          expires_on: string | null
          fabricacao: string | null
          fornecedor_documento: string | null
          fornecedor_nome: string | null
          id: string
          lote: string | null
          motivo: string | null
          note: string | null
          quantity_received: number
          quantity_remaining: number
          received_at: string
          registrado_por: string
          status: string
          supplier_id: string | null
          tenant_id: string
          unit_cost: number | null
        }
        Insert: {
          chave_acesso?: string | null
          component_id: string
          component_kind: string
          created_at?: string
          documento_emissao?: string | null
          documento_numero?: string | null
          documento_serie?: string | null
          documento_tipo?: string
          expires_on?: string | null
          fabricacao?: string | null
          fornecedor_documento?: string | null
          fornecedor_nome?: string | null
          id?: string
          lote?: string | null
          motivo?: string | null
          note?: string | null
          quantity_received: number
          quantity_remaining?: number
          received_at?: string
          registrado_por?: string
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          unit_cost?: number | null
        }
        Update: {
          chave_acesso?: string | null
          component_id?: string
          component_kind?: string
          created_at?: string
          documento_emissao?: string | null
          documento_numero?: string | null
          documento_serie?: string | null
          documento_tipo?: string
          expires_on?: string | null
          fabricacao?: string | null
          fornecedor_documento?: string | null
          fornecedor_nome?: string | null
          id?: string
          lote?: string | null
          motivo?: string | null
          note?: string | null
          quantity_received?: number
          quantity_remaining?: number
          received_at?: string
          registrado_por?: string
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_stock_lots_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "fastbar_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fastbar_stock_lots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "fastbar_stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
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
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tenant_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_supply_item_aliases: {
        Row: {
          component_id: string
          component_kind: string
          created_at: string
          id: string
          raw_text: string
          raw_text_normalized: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          component_id: string
          component_kind: string
          created_at?: string
          id?: string
          raw_text: string
          raw_text_normalized?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          component_id?: string
          component_kind?: string
          created_at?: string
          id?: string
          raw_text?: string
          raw_text_normalized?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_supply_item_aliases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_tab_items: {
        Row: {
          added_at: string
          id: string
          name: string
          product_id: string | null
          quantity: number
          session_id: string
          tenant_id: string
          unit_price: number
        }
        Insert: {
          added_at?: string
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          session_id: string
          tenant_id?: string
          unit_price?: number
        }
        Update: {
          added_at?: string
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          session_id?: string
          tenant_id?: string
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
          {
            foreignKeyName: "fastbar_tab_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_tenant_admins: {
        Row: {
          created_at: string
          email: string
          id: string
          last_login_at: string | null
          name: string
          password_hash: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          last_login_at?: string | null
          name: string
          password_hash: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_login_at?: string | null
          name?: string
          password_hash?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fastbar_tenant_admins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "fastbar_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fastbar_tenants: {
        Row: {
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          slug: string
          status: string
          trade_name: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          slug: string
          status?: string
          trade_name?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          slug?: string
          status?: string
          trade_name?: string | null
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
      fastbar_create_product:
        | {
            Args: {
              p_category: string
              p_image_url: string
              p_initial_stock: number
              p_name: string
              p_package_type: string
              p_price: number
              p_unit: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_campo_estoque: string
              p_category: string
              p_image_url: string
              p_initial_stock: number
              p_name: string
              p_package_type: string
              p_price: number
              p_tenant_id: string
              p_unit: string
            }
            Returns: Json
          }
      fastbar_default_tenant_id: { Args: never; Returns: string }
      fastbar_delete_base_drink:
        | { Args: { p_id: string }; Returns: Json }
        | { Args: { p_id: string; p_tenant_id: string }; Returns: Json }
      fastbar_delete_consumable: {
        Args: { p_id: string; p_tenant_id: string }
        Returns: Json
      }
      fastbar_delete_ingredient:
        | { Args: { p_id: string }; Returns: Json }
        | { Args: { p_id: string; p_tenant_id: string }; Returns: Json }
      fastbar_delete_product:
        | { Args: { p_product_id: string }; Returns: Json }
        | { Args: { p_product_id: string; p_tenant_id: string }; Returns: Json }
      fastbar_delete_product_category:
        | { Args: { p_id: string }; Returns: Json }
        | { Args: { p_id: string; p_tenant_id: string }; Returns: Json }
      fastbar_deplete_lots: {
        Args: {
          p_component_id: string
          p_component_kind: string
          p_quantity: number
        }
        Returns: undefined
      }
      fastbar_remove_tab_item: { Args: { p_item_id: string }; Returns: Json }
      fastbar_replenish_lots: {
        Args: {
          p_component_id: string
          p_component_kind: string
          p_quantity: number
        }
        Returns: undefined
      }
      fastbar_reset_catalog_and_stock: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
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
      fastbar_update_product:
        | {
            Args: {
              p_category: string
              p_change_image: boolean
              p_id: string
              p_image_url: string
              p_name: string
              p_package_type: string
              p_price: number
              p_unit: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_campo_estoque: string
              p_category: string
              p_change_campo_estoque: boolean
              p_change_image: boolean
              p_id: string
              p_image_url: string
              p_name: string
              p_package_type: string
              p_price: number
              p_unit: string
            }
            Returns: Json
          }
      fastbar_update_product_category:
        | { Args: { p_id: string; p_name: string }; Returns: Json }
        | {
            Args: { p_id: string; p_name: string; p_tenant_id: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
