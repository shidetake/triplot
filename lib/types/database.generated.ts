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
      events: {
        Row: {
          created_at: string
          created_by_member_id: string
          end_at: string | null
          id: string
          note: string | null
          place_id: string | null
          start_at: string
          title: string
          trip_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by_member_id: string
          end_at?: string | null
          id?: string
          note?: string | null
          place_id?: string | null
          start_at: string
          title: string
          trip_id: string
          visibility: string
        }
        Update: {
          created_at?: string
          created_by_member_id?: string
          end_at?: string | null
          id?: string
          note?: string | null
          place_id?: string | null
          start_at?: string
          title?: string
          trip_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string
          created_at: string
          emoji: string
          id: string
          name: string
          sort_order: number
          trip_id: string
        }
        Insert: {
          color: string
          created_at?: string
          emoji: string
          id?: string
          name: string
          sort_order: number
          trip_id: string
        }
        Update: {
          color?: string
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          sort_order?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_splits: {
        Row: {
          expense_id: string
          member_id: string
        }
        Insert: {
          expense_id: string
          member_id: string
        }
        Update: {
          expense_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          category_id: string
          created_at: string
          created_by_member_id: string
          id: string
          local_currency: string
          local_price: number
          note: string | null
          paid_at: string
          payer_member_id: string
          rate_to_default: number
          splittable: boolean
          trip_id: string
          visibility: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by_member_id: string
          id?: string
          local_currency: string
          local_price: number
          note?: string | null
          paid_at?: string
          payer_member_id: string
          rate_to_default: number
          splittable?: boolean
          trip_id: string
          visibility: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by_member_id?: string
          id?: string
          local_currency?: string
          local_price?: number
          note?: string | null
          paid_at?: string
          payer_member_id?: string
          rate_to_default?: number
          splittable?: boolean
          trip_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payer_member_id_fkey"
            columns: ["payer_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      place_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
          trip_id: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          name: string
          sort_order: number
          trip_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_statuses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          created_at: string
          created_by_member_id: string
          formatted_address: string
          google_place_id: string
          id: string
          lat: number
          lng: number
          name: string
          note: string | null
          status_id: string
          trip_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by_member_id: string
          formatted_address: string
          google_place_id: string
          id?: string
          lat: number
          lng: number
          name: string
          note?: string | null
          status_id: string
          trip_id: string
          visibility: string
        }
        Update: {
          created_at?: string
          created_by_member_id?: string
          formatted_address?: string
          google_place_id?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          note?: string | null
          status_id?: string
          trip_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "places_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "place_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_invites: {
        Row: {
          token_hash: string
          trip_id: string
        }
        Insert: {
          token_hash: string
          trip_id: string
        }
        Update: {
          token_hash?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_invites_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          color: string | null
          display_name: string
          id: string
          joined_at: string
          kind: string
          left_at: string | null
          trip_id: string
          user_id: string
        }
        Insert: {
          color?: string | null
          display_name: string
          id?: string
          joined_at?: string
          kind: string
          left_at?: string | null
          trip_id: string
          user_id: string
        }
        Update: {
          color?: string | null
          display_name?: string
          id?: string
          joined_at?: string
          kind?: string
          left_at?: string | null
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          default_currency: string
          end_date: string | null
          id: string
          last_activity_at: string
          start_date: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          end_date?: string | null
          id?: string
          last_activity_at?: string
          start_date?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          end_date?: string | null
          id?: string
          last_activity_at?: string
          start_date?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          google_uid: string | null
          id: string
          is_anonymous: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          google_uid?: string | null
          id: string
          is_anonymous?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          google_uid?: string | null
          id?: string
          is_anonymous?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_expense: {
        Args: {
          p_category_id: string
          p_local_currency: string
          p_local_price: number
          p_note: string
          p_paid_at: string
          p_payer_member_id: string
          p_rate_to_default: number
          p_split_member_ids: string[]
          p_splittable: boolean
          p_trip_id: string
          p_visibility: string
        }
        Returns: string
      }
      create_place: {
        Args: {
          p_formatted_address: string
          p_google_place_id: string
          p_lat: number
          p_lng: number
          p_name: string
          p_note: string
          p_status_id: string
          p_trip_id: string
          p_visibility: string
        }
        Returns: string
      }
      create_trip: {
        Args: {
          p_default_currency: string
          p_display_name: string
          p_end_date: string
          p_start_date: string
          p_title: string
        }
        Returns: string
      }
      is_active_trip_member: { Args: { _trip_id: string }; Returns: boolean }
      is_own_member: { Args: { _member_id: string }; Returns: boolean }
      nanoid: { Args: { size?: number }; Returns: string }
      seed_default_expense_categories: {
        Args: { _trip_id: string }
        Returns: undefined
      }
      seed_default_place_statuses: {
        Args: { _trip_id: string }
        Returns: undefined
      }
      update_place: {
        Args: {
          p_note: string
          p_place_id: string
          p_status_id: string
          p_visibility: string
        }
        Returns: undefined
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
