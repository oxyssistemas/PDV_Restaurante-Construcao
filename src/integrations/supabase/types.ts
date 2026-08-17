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
      customers: {
        Row: {
          address: string | null
          birthdate: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          restaurant_id: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          restaurant_id: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
          tags?: string[]
          updated_at?: string
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
      fiscal_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_document: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          discount: number
          id: string
          issued_at: string | null
          items: Json
          notes: string | null
          number: string | null
          order_id: string | null
          pdf_url: string | null
          provider: string | null
          provider_ref: string | null
          restaurant_id: string
          series: string | null
          status: Database["public"]["Enums"]["fiscal_invoice_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          issued_at?: string | null
          items?: Json
          notes?: string | null
          number?: string | null
          order_id?: string | null
          pdf_url?: string | null
          provider?: string | null
          provider_ref?: string | null
          restaurant_id: string
          series?: string | null
          status?: Database["public"]["Enums"]["fiscal_invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          issued_at?: string | null
          items?: Json
          notes?: string | null
          number?: string | null
          order_id?: string | null
          pdf_url?: string | null
          provider?: string | null
          provider_ref?: string | null
          restaurant_id?: string
          series?: string | null
          status?: Database["public"]["Enums"]["fiscal_invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
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
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          quantity: number
          reason?: string | null
          restaurant_id: string
          type: Database["public"]["Enums"]["inventory_movement_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          quantity?: number
          reason?: string | null
          restaurant_id?: string
          type?: Database["public"]["Enums"]["inventory_movement_type"]
          user_id?: string
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
      menu_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
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
      menu_items: {
        Row: {
          available: boolean
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_combo: boolean
          name: string
          price: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          available?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_combo?: boolean
          name: string
          price: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          available?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_combo?: boolean
          name?: string
          price?: number
          restaurant_id?: string
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
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          restaurant_id: string
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
      order_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          notes: string | null
          order_id: string
          quantity: number
          status: Database["public"]["Enums"]["order_item_status"]
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          notes?: string | null
          order_id: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price?: number
          updated_at?: string
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
      orders: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          courier_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          created_by_role: string | null
          customer_address: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_fee: number
          delivery_status: string
          id: string
          kitchen_session_id: string | null
          notes: string | null
          order_type: string
          restaurant_id: string
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          total: number
          updated_at: string
          waiter_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          created_by_role?: string | null
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_fee?: number
          delivery_status?: string
          id?: string
          kitchen_session_id?: string | null
          notes?: string | null
          order_type?: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          total?: number
          updated_at?: string
          waiter_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          created_by_role?: string | null
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_fee?: number
          delivery_status?: string
          id?: string
          kitchen_session_id?: string | null
          notes?: string | null
          order_type?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
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
          restaurant_id: string
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          merge_group_id?: string | null
          number: number
          restaurant_id: string
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          merge_group_id?: string | null
          number?: number
          restaurant_id?: string
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
          created_at: string
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          status: Database["public"]["Enums"]["restaurant_status"]
          subscription_plan: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          status?: Database["public"]["Enums"]["restaurant_status"]
          subscription_plan?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["restaurant_status"]
          subscription_plan?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_login_attempts: { Args: { _email: string }; Returns: undefined }
      get_user_restaurant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_restaurant_active: {
        Args: { _restaurant_id: string }
        Returns: boolean
      }
      login_lock_seconds: { Args: { _email: string }; Returns: number }
      register_login_failure: { Args: { _email: string }; Returns: number }
      user_belongs_to_restaurant: {
        Args: { _restaurant_id: string; _user_id: string }
        Returns: boolean
      }
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
      cash_movement_type: "sangria" | "suprimento"
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
      payment_method: "cash" | "credit_card" | "debit_card" | "pix"
      reservation_status: "confirmed" | "cancelled" | "completed" | "no_show"
      restaurant_status: "active" | "blocked"
      table_status: "free" | "occupied" | "reserved"
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
      ],
      cash_movement_type: ["sangria", "suprimento"],
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
      payment_method: ["cash", "credit_card", "debit_card", "pix"],
      reservation_status: ["confirmed", "cancelled", "completed", "no_show"],
      restaurant_status: ["active", "blocked"],
      table_status: ["free", "occupied", "reserved"],
    },
  },
} as const
