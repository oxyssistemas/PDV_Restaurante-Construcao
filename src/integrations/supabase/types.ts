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
      accountant_exports: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string
          file_size: number | null
          id: string
          invoiced: number
          invoices_count: number
          period: string
          restaurant_id: string
          revenue: number
          warnings: string[]
          xml_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          invoiced?: number
          invoices_count?: number
          period: string
          restaurant_id: string
          revenue?: number
          warnings?: string[]
          xml_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          invoiced?: number
          invoices_count?: number
          period?: string
          restaurant_id?: string
          revenue?: number
          warnings?: string[]
          xml_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "accountant_exports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          amount: number
          boleto_barcode: string | null
          boleto_id: string | null
          boleto_provider: string | null
          boleto_url: string | null
          category: string | null
          created_at: string
          created_by: string | null
          customer_document: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          description: string
          due_date: string
          id: string
          notes: string | null
          payment_method: string | null
          pix_code: string | null
          received_at: string | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          boleto_barcode?: string | null
          boleto_id?: string | null
          boleto_provider?: string | null
          boleto_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description: string
          due_date: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          pix_code?: string | null
          received_at?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          boleto_barcode?: string | null
          boleto_id?: string | null
          boleto_provider?: string | null
          boleto_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          pix_code?: string | null
          received_at?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      accounts_payable: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["payable_status"]
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["payable_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["payable_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          creative: Json
          daily_budget: number
          end_date: string | null
          error_message: string | null
          external_ids: Json
          id: string
          last_synced_at: string | null
          name: string
          objective: string
          platform: string
          restaurant_id: string
          start_date: string | null
          status: string
          targeting: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          creative?: Json
          daily_budget?: number
          end_date?: string | null
          error_message?: string | null
          external_ids?: Json
          id?: string
          last_synced_at?: string | null
          name: string
          objective: string
          platform: string
          restaurant_id: string
          start_date?: string | null
          status?: string
          targeting?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          creative?: Json
          daily_budget?: number
          end_date?: string | null
          error_message?: string | null
          external_ids?: Json
          id?: string
          last_synced_at?: string | null
          name?: string
          objective?: string
          platform?: string
          restaurant_id?: string
          start_date?: string | null
          status?: string
          targeting?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_metrics_daily: {
        Row: {
          campaign_id: string
          clicks: number
          conversations: number
          created_at: string
          id: string
          impressions: number
          metric_date: string
          restaurant_id: string
          spend: number
        }
        Insert: {
          campaign_id: string
          clicks?: number
          conversations?: number
          created_at?: string
          id?: string
          impressions?: number
          metric_date: string
          restaurant_id: string
          spend?: number
        }
        Update: {
          campaign_id?: string
          clicks?: number
          conversations?: number
          created_at?: string
          id?: string
          impressions?: number
          metric_date?: string
          restaurant_id?: string
          spend?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_metrics_daily_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_metrics_daily_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          restaurant_id: string
          summary: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          restaurant_id: string
          summary?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          restaurant_id?: string
          summary?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_settings: {
        Row: {
          advance_days: number
          duration_minutes: number
          hours: Json
          max_party: number
          min_notice_minutes: number
          min_party: number
          notice: string | null
          online_enabled: boolean
          restaurant_id: string
          slot_minutes: number
          slug: string
          updated_at: string
          waitlist_online: boolean
        }
        Insert: {
          advance_days?: number
          duration_minutes?: number
          hours?: Json
          max_party?: number
          min_notice_minutes?: number
          min_party?: number
          notice?: string | null
          online_enabled?: boolean
          restaurant_id: string
          slot_minutes?: number
          slug: string
          updated_at?: string
          waitlist_online?: boolean
        }
        Update: {
          advance_days?: number
          duration_minutes?: number
          hours?: Json
          max_party?: number
          min_notice_minutes?: number
          min_party?: number
          notice?: string | null
          online_enabled?: boolean
          restaurant_id?: string
          slot_minutes?: number
          slug?: string
          updated_at?: string
          waitlist_online?: boolean
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          account: string | null
          amount: number
          created_at: string
          fitid: string
          id: string
          matched_id: string | null
          matched_note: string | null
          matched_type: string | null
          memo: string | null
          posted_on: string
          reconciled_at: string | null
          restaurant_id: string
        }
        Insert: {
          account?: string | null
          amount: number
          created_at?: string
          fitid: string
          id?: string
          matched_id?: string | null
          matched_note?: string | null
          matched_type?: string | null
          memo?: string | null
          posted_on: string
          reconciled_at?: string | null
          restaurant_id: string
        }
        Update: {
          account?: string | null
          amount?: number
          created_at?: string
          fitid?: string
          id?: string
          matched_id?: string | null
          matched_note?: string | null
          matched_type?: string | null
          memo?: string | null
          posted_on?: string
          reconciled_at?: string | null
          restaurant_id?: string
        }
        Relationships: []
      }
      branding_settings: {
        Row: {
          accent_color: string | null
          background_color: string | null
          brand_name: string | null
          created_at: string
          density: string
          favicon_url: string | null
          font_body: string
          font_heading: string
          footer_text: string | null
          foreground_color: string | null
          id: string
          login_background_url: string | null
          login_message: string | null
          logo_dark_url: string | null
          logo_light_url: string | null
          primary_color: string | null
          radius: string
          receipt_footer: string | null
          receipt_header: string | null
          restaurant_id: string
          secondary_color: string | null
          sidebar_color: string | null
          theme_mode: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          background_color?: string | null
          brand_name?: string | null
          created_at?: string
          density?: string
          favicon_url?: string | null
          font_body?: string
          font_heading?: string
          footer_text?: string | null
          foreground_color?: string | null
          id?: string
          login_background_url?: string | null
          login_message?: string | null
          logo_dark_url?: string | null
          logo_light_url?: string | null
          primary_color?: string | null
          radius?: string
          receipt_footer?: string | null
          receipt_header?: string | null
          restaurant_id: string
          secondary_color?: string | null
          sidebar_color?: string | null
          theme_mode?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          background_color?: string | null
          brand_name?: string | null
          created_at?: string
          density?: string
          favicon_url?: string | null
          font_body?: string
          font_heading?: string
          footer_text?: string | null
          foreground_color?: string | null
          id?: string
          login_background_url?: string | null
          login_message?: string | null
          logo_dark_url?: string | null
          logo_light_url?: string | null
          primary_color?: string | null
          radius?: string
          receipt_footer?: string | null
          receipt_header?: string | null
          restaurant_id?: string
          secondary_color?: string | null
          sidebar_color?: string | null
          theme_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branding_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          cash_register_id: string
          created_at: string
          id: string
          reason: string
          restaurant_id: string
          type: Database["public"]["Enums"]["cash_movement_type"]
          user_id: string
        }
        Insert: {
          amount: number
          cash_register_id: string
          created_at?: string
          id?: string
          reason: string
          restaurant_id: string
          type: Database["public"]["Enums"]["cash_movement_type"]
          user_id: string
        }
        Update: {
          amount?: number
          cash_register_id?: string
          created_at?: string
          id?: string
          reason?: string
          restaurant_id?: string
          type?: Database["public"]["Enums"]["cash_movement_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          created_at: string
          id: string
          notes_closing: string | null
          notes_opening: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          restaurant_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          id?: string
          notes_closing?: string | null
          notes_opening?: string | null
          opened_at?: string
          opened_by: string
          opening_amount?: number
          restaurant_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          id?: string
          notes_closing?: string | null
          notes_opening?: string | null
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          created_at: string
          customer_phone: string | null
          customer_user_id: string | null
          discount: number
          id: string
          order_id: string
          promotion_id: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          discount?: number
          id?: string
          order_id: string
          promotion_id: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          discount?: number
          id?: string
          order_id?: string
          promotion_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      card_settings: {
        Row: {
          credit_days: number
          credit_fee: number
          debit_days: number
          debit_fee: number
          opening_balance: number
          opening_balance_on: string | null
          pix_fee: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          credit_days?: number
          credit_fee?: number
          debit_days?: number
          debit_fee?: number
          opening_balance?: number
          opening_balance_on?: string | null
          pix_fee?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          credit_days?: number
          credit_fee?: number
          debit_days?: number
          debit_fee?: number
          opening_balance?: number
          opening_balance_on?: string | null
          pix_fee?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      courier_locations: {
        Row: {
          accuracy: number | null
          courier_id: string
          heading: number | null
          lat: number
          lng: number
          restaurant_id: string
          speed: number | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          courier_id: string
          heading?: number | null
          lat: number
          lng: number
          restaurant_id: string
          speed?: number | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          courier_id?: string
          heading?: number | null
          lat?: number
          lng?: number
          restaurant_id?: string
          speed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_locations_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: true
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          phone: string | null
          plate: string | null
          restaurant_id: string
          status: string
          updated_at: string
          user_id: string | null
          vehicle: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          plate?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          plate?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couriers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          address: string | null
          complement: string | null
          created_at: string
          name: string
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          complement?: string | null
          created_at?: string
          name: string
          phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          complement?: string | null
          created_at?: string
          name?: string
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          birthdate: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          marketing_opt_in: boolean
          name: string
          notes: string | null
          phone: string | null
          restaurant_id: string
          tags: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          marketing_opt_in?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          restaurant_id: string
          tags?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          marketing_opt_in?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
          tags?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dedicated_servers: {
        Row: {
          activation_code_hash: string | null
          activation_expires_at: string | null
          cloud_purged_at: string | null
          created_at: string
          enabled: boolean
          key_hash: string | null
          lan_urls: string[]
          last_seen_at: string | null
          migrated_at: string | null
          migrated_rows: number | null
          own_supabase_url: string | null
          public_url: string | null
          restaurant_id: string
          status: string
          updated_at: string
          version: string | null
        }
        Insert: {
          activation_code_hash?: string | null
          activation_expires_at?: string | null
          cloud_purged_at?: string | null
          created_at?: string
          enabled?: boolean
          key_hash?: string | null
          lan_urls?: string[]
          last_seen_at?: string | null
          migrated_at?: string | null
          migrated_rows?: number | null
          own_supabase_url?: string | null
          public_url?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          activation_code_hash?: string | null
          activation_expires_at?: string | null
          cloud_purged_at?: string | null
          created_at?: string
          enabled?: boolean
          key_hash?: string | null
          lan_urls?: string[]
          last_seen_at?: string | null
          migrated_at?: string | null
          migrated_rows?: number | null
          own_supabase_url?: string | null
          public_url?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dedicated_servers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_promotions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image: string | null
          menu_item_id: string | null
          restaurant_id: string
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image?: string | null
          menu_item_id?: string | null
          restaurant_id: string
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image?: string | null
          menu_item_id?: string | null
          restaurant_id?: string
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_promotions_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_promotions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_stores: {
        Row: {
          address: string | null
          created_at: string
          default_fee: number
          delivery_enabled: boolean
          enabled: boolean
          fee_base: number
          fee_free_km: number
          fee_mode: string
          fee_per_km: number
          lat: number | null
          lng: number | null
          max_km: number | null
          eta_minutes: number
          featured_item_ids: string[]
          hero_highlight: string | null
          hero_image: string | null
          hero_subtitle: string | null
          hero_title: string | null
          hours_text: string | null
          is_open: boolean
          min_order: number
          notice: string | null
          payment_methods: string[]
          pickup_enabled: boolean
          pickup_eta_minutes: number
          restaurant_id: string
          slug: string
          updated_at: string
          whatsapp: string | null
          zones: Json
        }
        Insert: {
          address?: string | null
          created_at?: string
          default_fee?: number
          delivery_enabled?: boolean
          enabled?: boolean
          fee_base?: number
          fee_free_km?: number
          fee_mode?: string
          fee_per_km?: number
          lat?: number | null
          lng?: number | null
          max_km?: number | null
          eta_minutes?: number
          featured_item_ids?: string[]
          hero_highlight?: string | null
          hero_image?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          hours_text?: string | null
          is_open?: boolean
          min_order?: number
          notice?: string | null
          payment_methods?: string[]
          pickup_enabled?: boolean
          pickup_eta_minutes?: number
          restaurant_id: string
          slug: string
          updated_at?: string
          whatsapp?: string | null
          zones?: Json
        }
        Update: {
          address?: string | null
          created_at?: string
          default_fee?: number
          delivery_enabled?: boolean
          enabled?: boolean
          fee_base?: number
          fee_free_km?: number
          fee_mode?: string
          fee_per_km?: number
          lat?: number | null
          lng?: number | null
          max_km?: number | null
          eta_minutes?: number
          featured_item_ids?: string[]
          hero_highlight?: string | null
          hero_image?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          hours_text?: string | null
          is_open?: boolean
          min_order?: number
          notice?: string | null
          payment_methods?: string[]
          pickup_enabled?: boolean
          pickup_eta_minutes?: number
          restaurant_id?: string
          slug?: string
          updated_at?: string
          whatsapp?: string | null
          zones?: Json
        }
        Relationships: [
          {
            foreignKeyName: "delivery_stores_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_categories: {
        Row: {
          created_at: string
          group_key: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_key?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_key?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dre_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_shifts: {
        Row: {
          break_minutes: number
          created_at: string
          employee_id: string
          end_time: string
          id: string
          notes: string | null
          restaurant_id: string
          shift_date: string
          start_time: string
          updated_at: string
        }
        Insert: {
          break_minutes?: number
          created_at?: string
          employee_id: string
          end_time: string
          id?: string
          notes?: string | null
          restaurant_id: string
          shift_date: string
          start_time: string
          updated_at?: string
        }
        Update: {
          break_minutes?: number
          created_at?: string
          employee_id?: string
          end_time?: string
          id?: string
          notes?: string | null
          restaurant_id?: string
          shift_date?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          base_salary: number
          birthdate: string | null
          contract_type: string
          created_at: string
          document: string | null
          email: string | null
          hired_at: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pix_key: string | null
          restaurant_id: string
          role_title: string | null
          sector: string
          terminated_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          base_salary?: number
          birthdate?: string | null
          contract_type?: string
          created_at?: string
          document?: string | null
          email?: string | null
          hired_at?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          restaurant_id: string
          role_title?: string | null
          sector?: string
          terminated_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          base_salary?: number
          birthdate?: string | null
          contract_type?: string
          created_at?: string
          document?: string | null
          email?: string | null
          hired_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          restaurant_id?: string
          role_title?: string | null
          sector?: string
          terminated_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_settings: {
        Row: {
          alert_score: number
          enabled: boolean
          google_min_score: number
          google_review_url: string | null
          print_on_receipt: boolean
          restaurant_id: string
          thank_you: string | null
          updated_at: string
        }
        Insert: {
          alert_score?: number
          enabled?: boolean
          google_min_score?: number
          google_review_url?: string | null
          print_on_receipt?: boolean
          restaurant_id: string
          thank_you?: string | null
          updated_at?: string
        }
        Update: {
          alert_score?: number
          enabled?: boolean
          google_min_score?: number
          google_review_url?: string | null
          print_on_receipt?: boolean
          restaurant_id?: string
          thank_you?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_invoices: {
        Row: {
          access_key: string | null
          attempts: number
          cancel_reason: string | null
          cancelled_at: string | null
          consult_url: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_document: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          discount: number
          environment: Database["public"]["Enums"]["fiscal_environment"] | null
          error_message: string | null
          id: string
          issued_at: string | null
          items: Json
          locked_until: string | null
          next_attempt_at: string | null
          notes: string | null
          number: string | null
          order_id: string | null
          payments: Json
          pdf_url: string | null
          protocol: string | null
          provider: string | null
          provider_ref: string | null
          provider_response: Json | null
          qrcode_url: string | null
          restaurant_id: string
          series: string | null
          status: Database["public"]["Enums"]["fiscal_invoice_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          xml_path: string | null
          xml_url: string | null
        }
        Insert: {
          access_key?: string | null
          attempts?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          consult_url?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          environment?: Database["public"]["Enums"]["fiscal_environment"] | null
          error_message?: string | null
          id?: string
          issued_at?: string | null
          items?: Json
          locked_until?: string | null
          next_attempt_at?: string | null
          notes?: string | null
          number?: string | null
          order_id?: string | null
          payments?: Json
          pdf_url?: string | null
          protocol?: string | null
          provider?: string | null
          provider_ref?: string | null
          provider_response?: Json | null
          qrcode_url?: string | null
          restaurant_id: string
          series?: string | null
          status?: Database["public"]["Enums"]["fiscal_invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          xml_path?: string | null
          xml_url?: string | null
        }
        Update: {
          access_key?: string | null
          attempts?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          consult_url?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          environment?: Database["public"]["Enums"]["fiscal_environment"] | null
          error_message?: string | null
          id?: string
          issued_at?: string | null
          items?: Json
          locked_until?: string | null
          next_attempt_at?: string | null
          notes?: string | null
          number?: string | null
          order_id?: string | null
          payments?: Json
          pdf_url?: string | null
          protocol?: string | null
          provider?: string | null
          provider_ref?: string | null
          provider_response?: Json | null
          qrcode_url?: string | null
          restaurant_id?: string
          series?: string | null
          status?: Database["public"]["Enums"]["fiscal_invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          xml_path?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_profiles: {
        Row: {
          accountant_email: string | null
          accountant_name: string | null
          accountant_phone: string | null
          active: boolean
          auto_emit_on_payment: boolean
          certificate_expires_at: string | null
          certificate_path: string | null
          certificate_uploaded_at: string | null
          city: string | null
          city_code: string | null
          cnpj: string | null
          complement: string | null
          created_at: string
          csc_id: string | null
          csc_token: string | null
          default_cfop: string | null
          default_csosn: string | null
          default_ncm: string | null
          default_origin: string
          default_unit: string
          district: string | null
          environment: Database["public"]["Enums"]["fiscal_environment"]
          id: string
          legal_name: string | null
          municipal_registration: string | null
          nfce_next_number: number
          nfce_series: string
          number: string | null
          phone: string | null
          provider: string
          restaurant_id: string
          state: string | null
          state_registration: string | null
          street: string | null
          tax_regime: Database["public"]["Enums"]["tax_regime"]
          trade_name: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          accountant_email?: string | null
          accountant_name?: string | null
          accountant_phone?: string | null
          active?: boolean
          auto_emit_on_payment?: boolean
          certificate_expires_at?: string | null
          certificate_path?: string | null
          certificate_uploaded_at?: string | null
          city?: string | null
          city_code?: string | null
          cnpj?: string | null
          complement?: string | null
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          default_cfop?: string | null
          default_csosn?: string | null
          default_ncm?: string | null
          default_origin?: string
          default_unit?: string
          district?: string | null
          environment?: Database["public"]["Enums"]["fiscal_environment"]
          id?: string
          legal_name?: string | null
          municipal_registration?: string | null
          nfce_next_number?: number
          nfce_series?: string
          number?: string | null
          phone?: string | null
          provider?: string
          restaurant_id: string
          state?: string | null
          state_registration?: string | null
          street?: string | null
          tax_regime?: Database["public"]["Enums"]["tax_regime"]
          trade_name?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          accountant_email?: string | null
          accountant_name?: string | null
          accountant_phone?: string | null
          active?: boolean
          auto_emit_on_payment?: boolean
          certificate_expires_at?: string | null
          certificate_path?: string | null
          certificate_uploaded_at?: string | null
          city?: string | null
          city_code?: string | null
          cnpj?: string | null
          complement?: string | null
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          default_cfop?: string | null
          default_csosn?: string | null
          default_ncm?: string | null
          default_origin?: string
          default_unit?: string
          district?: string | null
          environment?: Database["public"]["Enums"]["fiscal_environment"]
          id?: string
          legal_name?: string | null
          municipal_registration?: string | null
          nfce_next_number?: number
          nfce_series?: string
          number?: string | null
          phone?: string | null
          provider?: string
          restaurant_id?: string
          state?: string | null
          state_registration?: string | null
          street?: string | null
          tax_regime?: Database["public"]["Enums"]["tax_regime"]
          trade_name?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_provider_accounts: {
        Row: {
          company_ref: string | null
          last_error: string | null
          provider: string
          restaurant_id: string
          synced_at: string | null
          token_homologation: string | null
          token_production: string | null
          updated_at: string
        }
        Insert: {
          company_ref?: string | null
          last_error?: string | null
          provider: string
          restaurant_id: string
          synced_at?: string | null
          token_homologation?: string | null
          token_production?: string | null
          updated_at?: string
        }
        Update: {
          company_ref?: string | null
          last_error?: string | null
          provider?: string
          restaurant_id?: string
          synced_at?: string | null
          token_homologation?: string | null
          token_production?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_provider_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ifood_events: {
        Row: {
          code: string | null
          created_at: string
          event_id: string
          id: string
          ifood_order_id: string | null
          payload: Json
          restaurant_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          event_id: string
          id?: string
          ifood_order_id?: string | null
          payload?: Json
          restaurant_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          event_id?: string
          id?: string
          ifood_order_id?: string | null
          payload?: Json
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ifood_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ifood_integrations: {
        Row: {
          auto_accept: boolean
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_sync_at: string | null
          merchant_id: string | null
          restaurant_id: string
          store_open: boolean
          sync_catalog: boolean
          sync_store_status: boolean
          updated_at: string
        }
        Insert: {
          auto_accept?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          merchant_id?: string | null
          restaurant_id: string
          store_open?: boolean
          sync_catalog?: boolean
          sync_store_status?: boolean
          updated_at?: string
        }
        Update: {
          auto_accept?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          merchant_id?: string | null
          restaurant_id?: string
          store_open?: boolean
          sync_catalog?: boolean
          sync_store_status?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ifood_integrations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ifood_orders: {
        Row: {
          created_at: string
          customer_address: string | null
          customer_name: string | null
          customer_phone: string | null
          decision: string
          display_id: string | null
          id: string
          ifood_order_id: string
          ifood_status: string | null
          last_error: string | null
          order_id: string | null
          payload: Json
          restaurant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          decision?: string
          display_id?: string | null
          id?: string
          ifood_order_id: string
          ifood_status?: string | null
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          restaurant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          decision?: string
          display_id?: string | null
          id?: string
          ifood_order_id?: string
          ifood_status?: string | null
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          restaurant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ifood_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ifood_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          cost_per_unit: number | null
          created_at: string
          id: string
          minimum_stock: number
          name: string
          quantity: number
          restaurant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          cost_per_unit?: number | null
          created_at?: string
          id?: string
          minimum_stock?: number
          name: string
          quantity?: number
          restaurant_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          cost_per_unit?: number | null
          created_at?: string
          id?: string
          minimum_stock?: number
          name?: string
          quantity?: number
          restaurant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          inventory_id: string
          quantity: number
          reason: string | null
          restaurant_id: string
          type: Database["public"]["Enums"]["inventory_movement_type"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          quantity: number
          reason?: string | null
          restaurant_id: string
          type: Database["public"]["Enums"]["inventory_movement_type"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          quantity?: number
          reason?: string | null
          restaurant_id?: string
          type?: Database["public"]["Enums"]["inventory_movement_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosks: {
        Row: {
          ask_phone: boolean
          created_at: string
          eat_in_enabled: boolean
          enabled: boolean
          id: string
          idle_seconds: number
          last_seen_at: string | null
          name: string
          restaurant_id: string
          takeaway_enabled: boolean
          token: string
          updated_at: string
          welcome_text: string | null
        }
        Insert: {
          ask_phone?: boolean
          created_at?: string
          eat_in_enabled?: boolean
          enabled?: boolean
          id?: string
          idle_seconds?: number
          last_seen_at?: string | null
          name: string
          restaurant_id: string
          takeaway_enabled?: boolean
          token?: string
          updated_at?: string
          welcome_text?: string | null
        }
        Update: {
          ask_phone?: boolean
          created_at?: string
          eat_in_enabled?: boolean
          enabled?: boolean
          id?: string
          idle_seconds?: number
          last_seen_at?: string | null
          name?: string
          restaurant_id?: string
          takeaway_enabled?: boolean
          token?: string
          updated_at?: string
          welcome_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kiosks_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          orders_archived: number
          restaurant_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          orders_archived?: number
          restaurant_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          orders_archived?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempts: number
          created_at: string
          email: string
          id: string
          last_attempt_at: string
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          email: string
          id?: string
          last_attempt_at?: string
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          email?: string
          id?: string
          last_attempt_at?: string
          locked_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          cashback_balance: number
          created_at: string
          customer_document: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          points_balance: number
          restaurant_id: string
          stamps: number
          total_earned: number
          total_redeemed: number
          updated_at: string
        }
        Insert: {
          cashback_balance?: number
          created_at?: string
          customer_document?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          points_balance?: number
          restaurant_id: string
          stamps?: number
          total_earned?: number
          total_redeemed?: number
          updated_at?: string
        }
        Update: {
          cashback_balance?: number
          created_at?: string
          customer_document?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          points_balance?: number
          restaurant_id?: string
          stamps?: number
          total_earned?: number
          total_redeemed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          cashback_percent: number
          channels: string[]
          created_at: string
          enabled: boolean
          id: string
          min_order_value: number
          mode: string
          name: string
          points_expire_days: number
          points_per_currency: number
          restaurant_id: string
          stamps_required: number
          terms: string | null
          updated_at: string
          weekday_multipliers: Json
        }
        Insert: {
          cashback_percent?: number
          channels?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          min_order_value?: number
          mode?: string
          name?: string
          points_expire_days?: number
          points_per_currency?: number
          restaurant_id: string
          stamps_required?: number
          terms?: string | null
          updated_at?: string
          weekday_multipliers?: Json
        }
        Update: {
          cashback_percent?: number
          channels?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          min_order_value?: number
          mode?: string
          name?: string
          points_expire_days?: number
          points_per_currency?: number
          restaurant_id?: string
          stamps_required?: number
          terms?: string | null
          updated_at?: string
          weekday_multipliers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          active: boolean
          cost_points: number
          created_at: string
          discount_percent: number
          discount_value: number
          id: string
          menu_item_id: string | null
          name: string
          restaurant_id: string
          reward_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cost_points?: number
          created_at?: string
          discount_percent?: number
          discount_value?: number
          id?: string
          menu_item_id?: string | null
          name: string
          restaurant_id: string
          reward_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cost_points?: number
          created_at?: string
          discount_percent?: number
          discount_value?: number
          id?: string
          menu_item_id?: string | null
          name?: string
          restaurant_id?: string
          reward_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          points: number
          restaurant_id: string
          reward_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          account_id: string
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          points?: number
          restaurant_id: string
          reward_id?: string | null
          type?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          points?: number
          restaurant_id?: string
          reward_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_accounts: {
        Row: {
          created_at: string
          external_id: string
          id: string
          kind: string
          metadata: Json
          name: string | null
          parent_id: string | null
          provider: string
          restaurant_id: string
          selected: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          kind: string
          metadata?: Json
          name?: string | null
          parent_id?: string | null
          provider: string
          restaurant_id: string
          selected?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          kind?: string
          metadata?: Json
          name?: string | null
          parent_id?: string | null
          provider?: string
          restaurant_id?: string
          selected?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          channels: string[]
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          restaurant_id: string
          scheduled_for: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          channels?: string[]
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          restaurant_id: string
          scheduled_for?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          channels?: string[]
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          restaurant_id?: string
          scheduled_for?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_connections: {
        Row: {
          account_name: string | null
          account_url: string | null
          connected_at: string | null
          created_at: string
          id: string
          metadata: Json
          provider: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_url?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          provider: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_url?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          provider?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_credentials: {
        Row: {
          access_token: string
          connected_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string | null
          restaurant_id: string
          scopes: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider: string
          refresh_token?: string | null
          restaurant_id: string
          scopes?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          restaurant_id?: string
          scopes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_metrics_daily: {
        Row: {
          calls: number | null
          channel: string
          created_at: string
          directions: number | null
          followers: number | null
          id: string
          metric_date: string
          reach: number | null
          restaurant_id: string
          updated_at: string
          views: number | null
        }
        Insert: {
          calls?: number | null
          channel: string
          created_at?: string
          directions?: number | null
          followers?: number | null
          id?: string
          metric_date: string
          reach?: number | null
          restaurant_id: string
          updated_at?: string
          views?: number | null
        }
        Update: {
          calls?: number | null
          channel?: string
          created_at?: string
          directions?: number | null
          followers?: number | null
          id?: string
          metric_date?: string
          reach?: number | null
          restaurant_id?: string
          updated_at?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_metrics_daily_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_posts: {
        Row: {
          caption: string
          channels: string[]
          created_at: string
          created_by: string | null
          error_message: string | null
          external_ids: Json
          id: string
          image_path: string | null
          locked_until: string | null
          media_type: string
          metrics: Json
          options: Json
          published_at: string | null
          restaurant_id: string
          results: Json
          scheduled_for: string | null
          status: string
          updated_at: string
        }
        Insert: {
          caption?: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          external_ids?: Json
          id?: string
          image_path?: string | null
          locked_until?: string | null
          media_type?: string
          metrics?: Json
          options?: Json
          published_at?: string | null
          restaurant_id: string
          results?: Json
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          caption?: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          external_ids?: Json
          id?: string
          image_path?: string | null
          locked_until?: string | null
          media_type?: string
          metrics?: Json
          options?: Json
          published_at?: string | null
          restaurant_id?: string
          results?: Json
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_posts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_integrations: {
        Row: {
          channel: string
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_event_at: string | null
          restaurant_id: string
          store_ref: string | null
          updated_at: string
          webhook_key: string
        }
        Insert: {
          channel: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          restaurant_id: string
          store_ref?: string | null
          updated_at?: string
          webhook_key?: string
        }
        Update: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          restaurant_id?: string
          store_ref?: string | null
          updated_at?: string
          webhook_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_integrations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_orders: {
        Row: {
          channel: string
          created_at: string
          customer_name: string | null
          display_id: string | null
          error: string | null
          external_id: string
          id: string
          order_id: string | null
          payload: Json | null
          restaurant_id: string
          status: string
          total: number | null
          unmatched_items: Json
        }
        Insert: {
          channel: string
          created_at?: string
          customer_name?: string | null
          display_id?: string | null
          error?: string | null
          external_id: string
          id?: string
          order_id?: string | null
          payload?: Json | null
          restaurant_id: string
          status?: string
          total?: number | null
          unmatched_items?: Json
        }
        Update: {
          channel?: string
          created_at?: string
          customer_name?: string | null
          display_id?: string | null
          error?: string | null
          external_id?: string
          id?: string
          order_id?: string | null
          payload?: Json | null
          restaurant_id?: string
          status?: string
          total?: number | null
          unmatched_items?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          source_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_components: {
        Row: {
          component_item_id: string
          created_at: string
          id: string
          parent_item_id: string
          quantity: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          component_item_id: string
          created_at?: string
          id?: string
          parent_item_id: string
          quantity?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          component_item_id?: string
          created_at?: string
          id?: string
          parent_item_id?: string
          quantity?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_components_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_components_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_components_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_ingredients: {
        Row: {
          created_at: string
          id: string
          inventory_id: string
          menu_item_id: string
          quantity: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          menu_item_id: string
          quantity?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          menu_item_id?: string
          quantity?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_ingredients_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_ingredients_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_option_groups: {
        Row: {
          created_at: string
          id: string
          kind: string
          max_select: number
          menu_item_id: string
          min_select: number
          name: string
          pricing: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          max_select?: number
          menu_item_id: string
          min_select?: number
          name: string
          pricing?: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          max_select?: number
          menu_item_id?: string
          min_select?: number
          name?: string
          pricing?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_option_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_option_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_options: {
        Row: {
          available: boolean
          created_at: string
          group_id: string
          id: string
          linked_item_id: string | null
          name: string
          price: number
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          group_id: string
          id?: string
          linked_item_id?: string | null
          name: string
          price?: number
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          available?: boolean
          created_at?: string
          group_id?: string
          id?: string
          linked_item_id?: string | null
          name?: string
          price?: number
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "menu_option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_options_linked_item_id_fkey"
            columns: ["linked_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_options_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          available: boolean
          available_days: number[]
          available_from: string | null
          available_to: string | null
          category_id: string | null
          cfop: string | null
          commercial_unit: string | null
          created_at: string
          csosn: string | null
          description: string | null
          external_codes: Json
          id: string
          ifood_product_id: string | null
          image_url: string | null
          is_combo: boolean
          is_rodizio_charge: boolean
          name: string
          ncm: string | null
          origin: string | null
          price: number
          restaurant_id: string
          rodizio_ids: string[]
          source_id: string | null
          sold_by_weight: boolean
          updated_at: string
        }
        Insert: {
          available?: boolean
          available_days?: number[]
          available_from?: string | null
          available_to?: string | null
          category_id?: string | null
          cfop?: string | null
          commercial_unit?: string | null
          created_at?: string
          csosn?: string | null
          description?: string | null
          external_codes?: Json
          id?: string
          ifood_product_id?: string | null
          image_url?: string | null
          is_combo?: boolean
          is_rodizio_charge?: boolean
          name: string
          ncm?: string | null
          origin?: string | null
          price: number
          restaurant_id: string
          rodizio_ids?: string[]
          source_id?: string | null
          sold_by_weight?: boolean
          updated_at?: string
        }
        Update: {
          available?: boolean
          available_days?: number[]
          available_from?: string | null
          available_to?: string | null
          category_id?: string | null
          cfop?: string | null
          commercial_unit?: string | null
          created_at?: string
          csosn?: string | null
          description?: string | null
          external_codes?: Json
          id?: string
          ifood_product_id?: string | null
          image_url?: string | null
          is_combo?: boolean
          is_rodizio_charge?: boolean
          name?: string
          ncm?: string | null
          origin?: string | null
          price?: number
          restaurant_id?: string
          rodizio_ids?: string[]
          source_id?: string | null
          sold_by_weight?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      module_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          restaurant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          restaurant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          restaurant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_permissions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          restaurant_id: string
          table_id: string | null
          target_roles: string[]
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          restaurant_id: string
          table_id?: string | null
          target_roles?: string[]
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          restaurant_id?: string
          table_id?: string | null
          target_roles?: string[]
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_hubs: {
        Row: {
          channel_token: string
          created_at: string
          created_by: string
          id: string
          key_hash: string
          lan_urls: string[]
          last_seen_at: string | null
          last_sync_at: string | null
          name: string
          pending_ops: number
          restaurant_id: string
          updated_at: string
          version: string | null
        }
        Insert: {
          channel_token?: string
          created_at?: string
          created_by: string
          id?: string
          key_hash: string
          lan_urls?: string[]
          last_seen_at?: string | null
          last_sync_at?: string | null
          name?: string
          pending_ops?: number
          restaurant_id: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          channel_token?: string
          created_at?: string
          created_by?: string
          id?: string
          key_hash?: string
          lan_urls?: string[]
          last_seen_at?: string | null
          last_sync_at?: string | null
          name?: string
          pending_ops?: number
          restaurant_id?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offline_hubs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_op_log: {
        Row: {
          applied_at: string
          hub_id: string
          op_id: string
          op_type: string
        }
        Insert: {
          applied_at?: string
          hub_id: string
          op_id: string
          op_type: string
        }
        Update: {
          applied_at?: string
          hub_id?: string
          op_id?: string
          op_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_op_log_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "offline_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          notes: string | null
          options: Json
          options_text: string | null
          order_id: string
          quantity: number
          status: Database["public"]["Enums"]["order_item_status"]
          unit_price: number
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          notes?: string | null
          options?: Json
          options_text?: string | null
          order_id: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price: number
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          notes?: string | null
          options?: Json
          options_text?: string | null
          order_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price?: number
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          food_score: number | null
          id: string
          order_id: string
          order_type: string | null
          replied_at: string | null
          reply: string | null
          restaurant_id: string
          score: number
          service_score: number | null
          speed_score: number | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          food_score?: number | null
          id?: string
          order_id: string
          order_type?: string | null
          replied_at?: string | null
          reply?: string | null
          restaurant_id: string
          score: number
          service_score?: number | null
          speed_score?: number | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          food_score?: number | null
          id?: string
          order_id?: string
          order_type?: string | null
          replied_at?: string | null
          reply?: string | null
          restaurant_id?: string
          score?: number
          service_score?: number | null
          speed_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_reviews_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          card_code: string | null
          change_for: number | null
          courier_id: string | null
          couvert_total: number | null
          coupon_code: string | null
          coupon_discount: number
          created_at: string
          created_by: string | null
          created_by_name: string | null
          created_by_role: string | null
          customer_address: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_user_id: string | null
          delivery_fee: number
          delivery_km: number | null
          delivery_lat: number | null
          delivery_lng: number | null
          route_seq: number | null
          third_party_cost: number | null
          third_party_provider: string | null
          third_party_tracking: string | null
          delivery_status: string
          discount: number
          id: string
          kitchen_session_id: string | null
          loyalty_awarded_at: string | null
          min_consumption_total: number | null
          notes: string | null
          order_type: string
          payment_hint: string | null
          promo_discount: number
          promo_labels: string | null
          people_count: number | null
          public_token: string | null
          reservation_id: string | null
          restaurant_id: string
          service_fee: number | null
          source: string
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          ticket_number: number | null
          total: number
          updated_at: string
          waiter_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          card_code?: string | null
          change_for?: number | null
          courier_id?: string | null
          couvert_total?: number | null
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          created_by_role?: string | null
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          delivery_fee?: number
          delivery_km?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          route_seq?: number | null
          third_party_cost?: number | null
          third_party_provider?: string | null
          third_party_tracking?: string | null
          delivery_status?: string
          discount?: number
          id?: string
          kitchen_session_id?: string | null
          loyalty_awarded_at?: string | null
          min_consumption_total?: number | null
          notes?: string | null
          order_type?: string
          payment_hint?: string | null
          promo_discount?: number
          promo_labels?: string | null
          people_count?: number | null
          public_token?: string | null
          reservation_id?: string | null
          restaurant_id: string
          service_fee?: number | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          ticket_number?: number | null
          total?: number
          updated_at?: string
          waiter_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          card_code?: string | null
          change_for?: number | null
          courier_id?: string | null
          couvert_total?: number | null
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          created_by_role?: string | null
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          delivery_fee?: number
          delivery_km?: number | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          route_seq?: number | null
          third_party_cost?: number | null
          third_party_provider?: string | null
          third_party_tracking?: string | null
          delivery_status?: string
          discount?: number
          id?: string
          kitchen_session_id?: string | null
          loyalty_awarded_at?: string | null
          min_consumption_total?: number | null
          notes?: string | null
          order_type?: string
          payment_hint?: string | null
          promo_discount?: number
          promo_labels?: string | null
          people_count?: number | null
          public_token?: string | null
          reservation_id?: string | null
          restaurant_id?: string
          service_fee?: number | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          ticket_number?: number | null
          total?: number
          updated_at?: string
          waiter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          cash_register_id: string | null
          change_amount: number | null
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          amount: number
          cash_register_id?: string | null
          change_amount?: number | null
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          amount?: number
          cash_register_id?: string | null
          change_amount?: number | null
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          notes: string | null
          paid_at: string | null
          reference_month: string
          restaurant_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference_month: string
          restaurant_id: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference_month?: string
          restaurant_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          name: string
          price_month: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          name: string
          price_month?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          name?: string
          price_month?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      print_agent_keys: {
        Row: {
          agent_info: Json | null
          created_at: string
          key_hash: string
          key_hint: string
          last_seen_at: string | null
          restaurant_id: string
        }
        Insert: {
          agent_info?: Json | null
          created_at?: string
          key_hash: string
          key_hint: string
          last_seen_at?: string | null
          restaurant_id: string
        }
        Update: {
          agent_info?: Json | null
          created_at?: string
          key_hash?: string
          key_hint?: string
          last_seen_at?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_agent_keys_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string | null
          document: Json
          error: string | null
          id: string
          order_id: string | null
          printed_at: string | null
          printer_id: string
          purpose: string
          restaurant_id: string
          status: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          document: Json
          error?: string | null
          id?: string
          order_id?: string | null
          printed_at?: string | null
          printer_id: string
          purpose: string
          restaurant_id: string
          status?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          document?: Json
          error?: string | null
          id?: string
          order_id?: string | null
          printed_at?: string | null
          printer_id?: string
          purpose?: string
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_settings: {
        Row: {
          copies: number
          created_at: string
          device_name: string | null
          enabled: boolean
          footer_note: string | null
          header_note: string | null
          id: string
          model: string
          purpose: string
          restaurant_id: string
          updated_at: string
          width: string
        }
        Insert: {
          copies?: number
          created_at?: string
          device_name?: string | null
          enabled?: boolean
          footer_note?: string | null
          header_note?: string | null
          id?: string
          model?: string
          purpose: string
          restaurant_id: string
          updated_at?: string
          width?: string
        }
        Update: {
          copies?: number
          created_at?: string
          device_name?: string | null
          enabled?: boolean
          footer_note?: string | null
          header_note?: string | null
          id?: string
          model?: string
          purpose?: string
          restaurant_id?: string
          updated_at?: string
          width?: string
        }
        Relationships: [
          {
            foreignKeyName: "printer_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          address: string | null
          auto_print: boolean
          connection: string
          copies: number
          created_at: string
          device_token: string
          enabled: boolean
          footer_note: string | null
          header_note: string | null
          id: string
          last_seen_at: string | null
          model: string
          name: string
          purposes: string[]
          restaurant_id: string
          updated_at: string
          width: string
        }
        Insert: {
          address?: string | null
          auto_print?: boolean
          connection?: string
          copies?: number
          created_at?: string
          device_token?: string
          enabled?: boolean
          footer_note?: string | null
          header_note?: string | null
          id?: string
          last_seen_at?: string | null
          model?: string
          name: string
          purposes?: string[]
          restaurant_id: string
          updated_at?: string
          width?: string
        }
        Update: {
          address?: string | null
          auto_print?: boolean
          connection?: string
          copies?: number
          created_at?: string
          device_token?: string
          enabled?: boolean
          footer_note?: string | null
          header_note?: string | null
          id?: string
          last_seen_at?: string | null
          model?: string
          name?: string
          purposes?: string[]
          restaurant_id?: string
          updated_at?: string
          width?: string
        }
        Relationships: [
          {
            foreignKeyName: "printers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string | null
          end_time: string
          id: string
          notes: string | null
          party_size: number
          reservation_date: string
          source: string
          restaurant_id: string
          start_time: string
          status: Database["public"]["Enums"]["reservation_status"]
          table_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          end_time: string
          id?: string
          notes?: string | null
          party_size?: number
          reservation_date: string
          source?: string
          restaurant_id: string
          start_time: string
          status?: Database["public"]["Enums"]["reservation_status"]
          table_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          party_size?: number
          reservation_date?: string
          source?: string
          restaurant_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          capacity: number
          created_at: string
          id: string
          merge_group_id: string | null
          number: number
          qr_enabled: boolean
          qr_token: string
          restaurant_id: string
          rodizio_adults: number | null
          rodizio_children: number | null
          rodizio_id: string | null
          rodizio_started_at: string | null
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          merge_group_id?: string | null
          number: number
          qr_enabled?: boolean
          qr_token?: string
          restaurant_id: string
          rodizio_adults?: number | null
          rodizio_children?: number | null
          rodizio_id?: string | null
          rodizio_started_at?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          merge_group_id?: string | null
          number?: number
          qr_enabled?: boolean
          qr_token?: string
          restaurant_id?: string
          rodizio_adults?: number | null
          rodizio_children?: number | null
          rodizio_id?: string | null
          rodizio_started_at?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          branch_limit: number
          created_at: string
          id: string
          logo_url: string | null
          name: string
          parent_id: string | null
          phone: string | null
          plan_code: string
          status: Database["public"]["Enums"]["restaurant_status"]
          subscription_plan: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_limit?: number
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          parent_id?: string | null
          phone?: string | null
          plan_code?: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          subscription_plan?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_limit?: number
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          parent_id?: string | null
          phone?: string | null
          plan_code?: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          subscription_plan?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          active: boolean
          amount: number | null
          buy_qty: number | null
          category_ids: string[]
          channels: string[]
          code: string | null
          created_at: string
          days: number[]
          discount_type: string | null
          ends_on: string | null
          id: string
          item_ids: string[]
          kind: string
          max_uses: number | null
          min_order: number
          name: string
          pay_qty: number | null
          per_customer: number | null
          percent: number | null
          restaurant_id: string
          starts_on: string | null
          time_from: string | null
          time_to: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number | null
          buy_qty?: number | null
          category_ids?: string[]
          channels?: string[]
          code?: string | null
          created_at?: string
          days?: number[]
          discount_type?: string | null
          ends_on?: string | null
          id?: string
          item_ids?: string[]
          kind: string
          max_uses?: number | null
          min_order?: number
          name: string
          pay_qty?: number | null
          per_customer?: number | null
          percent?: number | null
          restaurant_id: string
          starts_on?: string | null
          time_from?: string | null
          time_to?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number | null
          buy_qty?: number | null
          category_ids?: string[]
          channels?: string[]
          code?: string | null
          created_at?: string
          days?: number[]
          discount_type?: string | null
          ends_on?: string | null
          id?: string
          item_ids?: string[]
          kind?: string
          max_uses?: number | null
          min_order?: number
          name?: string
          pay_qty?: number | null
          per_customer?: number | null
          percent?: number | null
          restaurant_id?: string
          starts_on?: string | null
          time_from?: string | null
          time_to?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          access_key: string | null
          created_at: string
          created_by: string | null
          id: string
          issued_at: string | null
          items: Json
          number: string | null
          purchase_order_id: string | null
          restaurant_id: string
          supplier_id: string | null
          supplier_name: string | null
          total: number
        }
        Insert: {
          access_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          items?: Json
          number?: string | null
          purchase_order_id?: string | null
          restaurant_id: string
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number
        }
        Update: {
          access_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          items?: Json
          number?: string | null
          purchase_order_id?: string | null
          restaurant_id?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          expected_date: string | null
          id: string
          items: Json
          notes: string | null
          received_at: string | null
          restaurant_id: string
          status: string
          supplier_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          items?: Json
          notes?: string | null
          received_at?: string | null
          restaurant_id: string
          status?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          items?: Json
          notes?: string | null
          received_at?: string | null
          restaurant_id?: string
          status?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rodizios: {
        Row: {
          active: boolean
          charge_item_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          price_adult: number
          price_child: number | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          charge_item_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_adult?: number
          price_child?: number | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          charge_item_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_adult?: number
          price_child?: number | null
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_settings: {
        Row: {
          couvert_amount: number
          couvert_enabled: boolean
          couvert_label: string
          min_consumption_amount: number
          min_consumption_enabled: boolean
          waiter_commission_base: string
          waiter_commission_percent: number
          restaurant_id: string
          service_enabled: boolean
          service_on_delivery: boolean
          service_percent: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          couvert_amount?: number
          couvert_enabled?: boolean
          couvert_label?: string
          min_consumption_amount?: number
          min_consumption_enabled?: boolean
          waiter_commission_base?: string
          waiter_commission_percent?: number
          restaurant_id: string
          service_enabled?: boolean
          service_on_delivery?: boolean
          service_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          couvert_amount?: number
          couvert_enabled?: boolean
          couvert_label?: string
          min_consumption_amount?: number
          min_consumption_enabled?: boolean
          waiter_commission_base?: string
          waiter_commission_percent?: number
          restaurant_id?: string
          service_enabled?: boolean
          service_on_delivery?: boolean
          service_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_items: {
        Row: {
          cost_per_unit: number
          count_id: string
          counted_at: string | null
          counted_by: string | null
          counted_quantity: number | null
          created_at: string
          id: string
          inventory_id: string | null
          justification: string | null
          name: string
          reason: string | null
          restaurant_id: string
          system_quantity: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          cost_per_unit?: number
          count_id: string
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          created_at?: string
          id?: string
          inventory_id?: string | null
          justification?: string | null
          name: string
          reason?: string | null
          restaurant_id: string
          system_quantity: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          cost_per_unit?: number
          count_id?: string
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          created_at?: string
          id?: string
          inventory_id?: string | null
          justification?: string | null
          name?: string
          reason?: string | null
          restaurant_id?: string
          system_quantity?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_settings: {
        Row: {
          blind_count: boolean
          frequency: string
          month_day: number
          next_due_date: string | null
          restaurant_id: string
          updated_at: string
          updated_by: string | null
          weekday: number
        }
        Insert: {
          blind_count?: boolean
          frequency?: string
          month_day?: number
          next_due_date?: string | null
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
          weekday?: number
        }
        Update: {
          blind_count?: boolean
          frequency?: string
          month_day?: number
          next_due_date?: string | null
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          blind_count: boolean
          closed_at: string | null
          closed_by: string | null
          created_at: string
          due_date: string | null
          general_notes: string | null
          id: string
          items_divergent: number
          items_total: number
          kind: string
          responsible_name: string | null
          responsible_role: string | null
          restaurant_id: string
          signature: string | null
          started_at: string | null
          started_by: string | null
          status: string
          stock_adjusted: boolean
          updated_at: string
          value_counted: number
          value_difference: number
          value_system: number
        }
        Insert: {
          blind_count?: boolean
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          due_date?: string | null
          general_notes?: string | null
          id?: string
          items_divergent?: number
          items_total?: number
          kind?: string
          responsible_name?: string | null
          responsible_role?: string | null
          restaurant_id: string
          signature?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          stock_adjusted?: boolean
          updated_at?: string
          value_counted?: number
          value_difference?: number
          value_system?: number
        }
        Update: {
          blind_count?: boolean
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          due_date?: string | null
          general_notes?: string | null
          id?: string
          items_divergent?: number
          items_total?: number
          kind?: string
          responsible_name?: string | null
          responsible_role?: string | null
          restaurant_id?: string
          signature?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          stock_adjusted?: boolean
          updated_at?: string
          value_counted?: number
          value_difference?: number
          value_system?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          category: string | null
          contact_name: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          category?: string | null
          contact_name?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          category?: string | null
          contact_name?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_active_restaurant: {
        Row: {
          restaurant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          restaurant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          restaurant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_active_restaurant_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding: {
        Row: {
          muted: boolean
          seen: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          muted?: boolean
          seen?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          muted?: boolean
          seen?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_bot_settings: {
        Row: {
          closed_message: string
          created_at: string
          enabled: boolean
          greeting: string
          human_pause_minutes: number
          notify_status: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          closed_message?: string
          created_at?: string
          enabled?: boolean
          greeting?: string
          human_pause_minutes?: number
          notify_status?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          closed_message?: string
          created_at?: string
          enabled?: boolean
          greeting?: string
          human_pause_minutes?: number
          notify_status?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_bot_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          bot_paused_until: string | null
          contact_name: string | null
          created_at: string
          customer_id: string | null
          id: string
          last_bot_at: string | null
          last_inbound_at: string | null
          last_message: string | null
          last_message_at: string | null
          last_order_id: string | null
          needs_human: boolean
          phone: string
          restaurant_id: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          bot_paused_until?: string | null
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          last_bot_at?: string | null
          last_inbound_at?: string | null
          last_message?: string | null
          last_message_at?: string | null
          last_order_id?: string | null
          needs_human?: boolean
          phone: string
          restaurant_id: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          bot_paused_until?: string | null
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          last_bot_at?: string | null
          last_inbound_at?: string | null
          last_message?: string | null
          last_message_at?: string | null
          last_order_id?: string | null
          needs_human?: boolean
          phone?: string
          restaurant_id?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_last_order_id_fkey"
            columns: ["last_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          error_message: string | null
          external_id: string | null
          id: string
          message_type: string
          restaurant_id: string
          sent_by: string | null
          status: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          message_type?: string
          restaurant_id: string
          sent_by?: string | null
          status?: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          message_type?: string
          restaurant_id?: string
          sent_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          language: string
          name: string
          restaurant_id: string
          status: string
          updated_at: string
          variables: number
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          language?: string
          name: string
          restaurant_id: string
          status?: string
          updated_at?: string
          variables?: number
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          language?: string
          name?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
          variables?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          called_at: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          party_size: number
          phone: string | null
          public_token: string
          restaurant_id: string
          seated_at: string | null
          source: string
          status: string
          table_id: string | null
          updated_at: string
        }
        Insert: {
          called_at?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          party_size?: number
          phone?: string | null
          public_token?: string
          restaurant_id: string
          seated_at?: string | null
          source?: string
          status?: string
          table_id?: string | null
          updated_at?: string
        }
        Update: {
          called_at?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          party_size?: number
          phone?: string | null
          public_token?: string
          restaurant_id?: string
          seated_at?: string | null
          source?: string
          status?: string
          table_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_campaign_recipients: {
        Row: {
          campaign_id: string
          error: string | null
          id: string
          name: string | null
          phone: string
          restaurant_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          error?: string | null
          id?: string
          name?: string | null
          phone: string
          restaurant_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          error?: string | null
          id?: string
          name?: string | null
          phone?: string
          restaurant_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      whatsapp_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          failed: number
          id: string
          message: string | null
          mode: string
          name: string
          restaurant_id: string
          segment: Json
          sent: number
          status: string
          template_lang: string
          template_name: string | null
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          failed?: number
          id?: string
          message?: string | null
          mode?: string
          name: string
          restaurant_id: string
          segment?: Json
          sent?: number
          status?: string
          template_lang?: string
          template_name?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          failed?: number
          id?: string
          message?: string | null
          mode?: string
          name?: string
          restaurant_id?: string
          segment?: Json
          sent?: number
          status?: string
          template_lang?: string
          template_name?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_offline_ops: {
        Args: { _hub_id: string; _ops: Json }
        Returns: Json
      }
      auth_user_by_email: {
        Args: { _email: string }
        Returns: {
          id: string
          is_customer: boolean
          is_super: boolean
          roles: string[]
        }[]
      }
      cancel_stock_count: { Args: { _count_id: string }; Returns: undefined }
      claim_print_job: {
        Args: { _job_id: string; _station: string }
        Returns: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string | null
          document: Json
          error: string | null
          id: string
          order_id: string | null
          printed_at: string | null
          printer_id: string
          purpose: string
          restaurant_id: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_login_attempts: { Args: { _email: string }; Returns: undefined }
      close_stock_count: {
        Args: {
          _adjust: boolean
          _count_id: string
          _general_notes: string
          _responsible_name: string
          _responsible_role: string
          _signature: string
        }
        Returns: Json
      }
      create_kiosk_order: {
        Args: { _order: Json; _token: string }
        Returns: {
          order_id: string
          ticket_number: number
          total: number
        }[]
      }
      create_marketplace_order: {
        Args: { _integration: string; _o: Json }
        Returns: string
      }
      create_online_order: {
        Args: { _order: Json; _slug: string; _user_id: string }
        Returns: {
          order_id: string
          public_token: string
        }[]
      }
      create_qr_order: {
        Args: { _customer_name: string; _items: Json; _qr_token: string }
        Returns: string
      }
      dedicated_export: {
        Args: {
          _limit?: number
          _offset?: number
          _restaurant_id: string
          _table: string
        }
        Returns: Json
      }
      dedicated_purge_cloud: {
        Args: { _restaurant_id: string }
        Returns: number
      }
      dedicated_schema: { Args: never; Returns: Json }
      dedicated_tables: { Args: never; Returns: string[] }
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      fiscal_cron_secret: { Args: never; Returns: string }
      fiscal_kick: { Args: { _invoice_id: string }; Returns: undefined }
      get_user_restaurant_id: { Args: { _user_id: string }; Returns: string }
      has_module_access: {
        Args: {
          _edit?: boolean
          _module: string
          _restaurant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_delivery_staff: { Args: { _restaurant_id: string }; Returns: boolean }
      is_offline_sync: { Args: never; Returns: boolean }
      is_restaurant_active: {
        Args: { _restaurant_id: string }
        Returns: boolean
      }
      link_store_customer: {
        Args: { _restaurant_id: string; _user_id: string }
        Returns: string
      }
      login_lock_seconds: { Args: { _email: string }; Returns: number }
      loyalty_award_order: { Args: { _order_id: string }; Returns: undefined }
      loyalty_lookup: { Args: { _phone: string }; Returns: Json }
      marketing_cron_secret: { Args: never; Returns: string }
      module_guard: {
        Args: { _edit?: boolean; _module: string; _restaurant_id: string }
        Returns: boolean
      }
      my_dedicated_server: {
        Args: never
        Returns: {
          lan_urls: string[]
          public_url: string
          restaurant_id: string
          status: string
        }[]
      }
      network_summary: { Args: { _from: string; _to: string }; Returns: Json }
      next_stock_count_date: {
        Args: {
          _after: string
          _frequency: string
          _month_day: number
          _weekday: number
        }
        Returns: string
      }
      norm_phone: { Args: { _v: string }; Returns: string }
      offline_apply_row: {
        Args: { _op: Json; _restaurant_id: string }
        Returns: undefined
      }
      offline_replica: { Args: { _restaurant_id: string }; Returns: Json }
      offline_snapshot: { Args: { _restaurant_id: string }; Returns: Json }
      print_order_header: { Args: { _order_id: string }; Returns: Json }
      print_restaurant_name: {
        Args: { _restaurant_id: string }
        Returns: string
      }
      printer_device_token: { Args: { _printer_id: string }; Returns: string }
      register_login_failure: { Args: { _email: string }; Returns: number }
      restaurant_has_feature: {
        Args: { _feature: string; _restaurant_id: string }
        Returns: boolean
      }
      review_info: { Args: { _token: string }; Returns: Json }
      review_url: { Args: { _order_id: string }; Returns: string }
      rotate_printer_token: { Args: { _printer_id: string }; Returns: string }
      set_active_restaurant: {
        Args: { _restaurant_id: string }
        Returns: string
      }
      start_stock_count: { Args: { _count_id?: string }; Returns: string }
      stock_count_scheduler: { Args: never; Returns: number }
      store_media_folder_ok: { Args: { _name: string }; Returns: boolean }
      receive_purchase: { Args: { _p: Json; _restaurant_id: string }; Returns: Json }
      transfer_stock: { Args: { _from: string; _items: Json; _note: string; _to: string }; Returns: Json }
      finance_integration_status: { Args: { _restaurant_id: string }; Returns: Json }
      campaign_audience: { Args: { _restaurant_id: string; _seg: Json }; Returns: Json }
      coupon_check: {
        Args: { _code: string; _fee: number; _phone: string; _restaurant_id: string; _subtotal: number; _user_id: string }
        Returns: Json
      }
      menu_item_quote: {
        Args: { _item: string; _options: Json }
        Returns: { label: string; price: number }[]
      }
      my_trial_status: {
        Args: never
        Returns: {
          expired: boolean
          name: string
          restaurant_id: string
          trial_ends_at: string
        }[]
      }
      trial_plan_suggestion: {
        Args: { _restaurant_id: string }
        Returns: Json
      }
      staff_emails: {
        Args: { _restaurant_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      submit_review: {
        Args: {
          _comment: string
          _food: number
          _score: number
          _service: number
          _speed: number
          _token: string
        }
        Returns: Json
      }
      user_belongs_to_restaurant: {
        Args: { _restaurant_id: string; _user_id: string }
        Returns: boolean
      }
      whatsapp_bot_secret: { Args: never; Returns: string }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "waiter"
        | "kitchen"
        | "cashier"
        | "finance"
        | "delivery"
        | "courier"
        | "hr"
        | "marketing"
        | "manager"
        | "supervisor"
      cash_movement_type: "sangria" | "suprimento"
      fiscal_environment: "homologation" | "production"
      fiscal_invoice_status:
        | "draft"
        | "pending"
        | "issued"
        | "cancelled"
        | "error"
      inventory_movement_type: "entry" | "exit"
      order_item_status:
        | "pending"
        | "preparing"
        | "ready"
        | "delivered"
        | "cancelled"
      order_status:
        | "pending"
        | "preparing"
        | "ready"
        | "delivered"
        | "cancelled"
      payable_status: "open" | "paid" | "cancelled"
      payment_method: "cash" | "credit_card" | "debit_card" | "pix" | "cashback"
      reservation_status: "confirmed" | "cancelled" | "completed" | "no_show"
      restaurant_status: "active" | "blocked"
      table_status: "free" | "occupied" | "reserved"
      tax_regime: "simples_nacional" | "simples_excesso" | "regime_normal"
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
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "waiter",
        "kitchen",
        "cashier",
        "finance",
        "delivery",
        "courier",
        "hr",
        "marketing",
        "manager",
        "supervisor",
      ],
      cash_movement_type: ["sangria", "suprimento"],
      fiscal_environment: ["homologation", "production"],
      fiscal_invoice_status: [
        "draft",
        "pending",
        "issued",
        "cancelled",
        "error",
      ],
      inventory_movement_type: ["entry", "exit"],
      order_item_status: [
        "pending",
        "preparing",
        "ready",
        "delivered",
        "cancelled",
      ],
      order_status: ["pending", "preparing", "ready", "delivered", "cancelled"],
      payable_status: ["open", "paid", "cancelled"],
      payment_method: ["cash", "credit_card", "debit_card", "pix", "cashback"],
      reservation_status: ["confirmed", "cancelled", "completed", "no_show"],
      restaurant_status: ["active", "blocked"],
      table_status: ["free", "occupied", "reserved"],
      tax_regime: ["simples_nacional", "simples_excesso", "regime_normal"],
    },
  },
} as const
