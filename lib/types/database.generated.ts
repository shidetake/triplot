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
      event_participants: {
        Row: {
          event_id: string
          member_id: string
        }
        Insert: {
          event_id: string
          member_id: string
        }
        Update: {
          event_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by_member_id: string
          end_at: string | null
          end_tz: string | null
          id: string
          kind: string
          note: string | null
          place_id: string | null
          start_at: string
          start_tz: string
          title: string
          trip_id: string
          visibility: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by_member_id: string
          end_at?: string | null
          end_tz?: string | null
          id?: string
          kind?: string
          note?: string | null
          place_id?: string | null
          start_at: string
          start_tz: string
          title: string
          trip_id: string
          visibility: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by_member_id?: string
          end_at?: string | null
          end_tz?: string | null
          id?: string
          kind?: string
          note?: string | null
          place_id?: string | null
          start_at?: string
          start_tz?: string
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
          icon: string
          id: string
          name: string
          sort_order: number
          trip_id: string
        }
        Insert: {
          color: string
          created_at?: string
          icon: string
          id?: string
          name: string
          sort_order: number
          trip_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
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
          occurred_at: string
          paid_at: string
          payer_member_id: string
          place_id: string | null
          rate_to_default: number
          splittable: boolean
          trip_id: string
          tz: string
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
          occurred_at: string
          paid_at?: string
          payer_member_id: string
          place_id?: string | null
          rate_to_default: number
          splittable?: boolean
          trip_id: string
          tz: string
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
          occurred_at?: string
          paid_at?: string
          payer_member_id?: string
          place_id?: string | null
          rate_to_default?: number
          splittable?: boolean
          trip_id?: string
          tz?: string
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
            foreignKeyName: "expenses_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
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
      inbound_emails: {
        Row: {
          body_text: string | null
          expense_id: string | null
          extract_error: string | null
          extracted: Json | null
          extracted_at: string | null
          id: string
          merged_extracted: Json | null
          merged_into: string | null
          message_id: string | null
          next_retry_at: string | null
          raw: string | null
          received_at: string
          recipient: string
          retry_count: number
          sender: string
          size: number | null
          status: string
          subject: string | null
          trip_id: string | null
          user_id: string | null
        }
        Insert: {
          body_text?: string | null
          expense_id?: string | null
          extract_error?: string | null
          extracted?: Json | null
          extracted_at?: string | null
          id?: string
          merged_extracted?: Json | null
          merged_into?: string | null
          message_id?: string | null
          next_retry_at?: string | null
          raw?: string | null
          received_at?: string
          recipient: string
          retry_count?: number
          sender: string
          size?: number | null
          status?: string
          subject?: string | null
          trip_id?: string | null
          user_id?: string | null
        }
        Update: {
          body_text?: string | null
          expense_id?: string | null
          extract_error?: string | null
          extracted?: Json | null
          extracted_at?: string | null
          id?: string
          merged_extracted?: Json | null
          merged_into?: string | null
          message_id?: string | null
          next_retry_at?: string | null
          raw?: string | null
          received_at?: string
          recipient?: string
          retry_count?: number
          sender?: string
          size?: number | null
          status?: string
          subject?: string | null
          trip_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_emails_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "inbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          tentative: boolean
          trip_id: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          name: string
          sort_order: number
          tentative?: boolean
          trip_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          tentative?: boolean
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
          formatted_address: string | null
          google_place_id: string | null
          icon: string
          id: string
          lat: number | null
          lng: number | null
          locality: string | null
          name: string
          note: string | null
          region: string | null
          status_id: string
          trip_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by_member_id: string
          formatted_address?: string | null
          google_place_id?: string | null
          icon?: string
          id?: string
          lat?: number | null
          lng?: number | null
          locality?: string | null
          name: string
          note?: string | null
          region?: string | null
          status_id: string
          trip_id: string
          visibility: string
        }
        Update: {
          created_at?: string
          created_by_member_id?: string
          formatted_address?: string | null
          google_place_id?: string | null
          icon?: string
          id?: string
          lat?: number | null
          lng?: number | null
          locality?: string | null
          name?: string
          note?: string | null
          region?: string | null
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
      todo_likes: {
        Row: {
          created_at: string
          member_id: string
          todo_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          todo_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          todo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_likes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_likes_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          created_at: string
          created_by_member_id: string
          done: boolean
          event_id: string | null
          id: string
          kind: string
          priority: string
          title: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          created_by_member_id: string
          done?: boolean
          event_id?: string | null
          id?: string
          kind?: string
          priority?: string
          title: string
          trip_id: string
        }
        Update: {
          created_at?: string
          created_by_member_id?: string
          done?: boolean
          event_id?: string | null
          id?: string
          kind?: string
          priority?: string
          title?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_invites: {
        Row: {
          created_at: string
          created_by_member_id: string | null
          token: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          created_by_member_id?: string | null
          token: string
          trip_id: string
        }
        Update: {
          created_at?: string
          created_by_member_id?: string | null
          token?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_invites_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invites_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          color: number | null
          display_name: string
          id: string
          is_admin: boolean
          joined_at: string
          kind: string
          left_at: string | null
          trip_id: string
          user_id: string
        }
        Insert: {
          color?: number | null
          display_name: string
          id?: string
          is_admin?: boolean
          joined_at?: string
          kind: string
          left_at?: string | null
          trip_id: string
          user_id: string
        }
        Update: {
          color?: number | null
          display_name?: string
          id?: string
          is_admin?: boolean
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
      trip_pin_options: {
        Row: {
          created_at: string
          icon: string
          id: string
          label: string
          sort_order: number
          trip_id: string
        }
        Insert: {
          created_at?: string
          icon: string
          id?: string
          label: string
          sort_order: number
          trip_id: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_pin_options_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
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
          title: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          end_date?: string | null
          id?: string
          last_activity_at?: string
          start_date?: string | null
          title: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          end_date?: string | null
          id?: string
          last_activity_at?: string
          start_date?: string | null
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
          import_token: string | null
          is_anonymous: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          google_uid?: string | null
          id: string
          import_token?: string | null
          is_anonymous?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          google_uid?: string | null
          id?: string
          import_token?: string | null
          is_anonymous?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_inbound_email_trip: {
        Args: { p_id: string; p_trip_id: string }
        Returns: undefined
      }
      copy_trip: {
        Args: {
          p_default_currency: string
          p_display_name: string
          p_end_date: string
          p_events: Json
          p_source_trip_id: string
          p_start_date: string
          p_title: string
        }
        Returns: string
      }
      create_event: {
        Args: {
          p_all_day: boolean
          p_end_at: string
          p_end_tz: string
          p_kind: string
          p_note: string
          p_participant_member_ids: string[]
          p_place_id: string
          p_start_at: string
          p_start_tz: string
          p_title: string
          p_trip_id: string
          p_visibility: string
        }
        Returns: string
      }
      create_event_with_freetext_place: {
        Args: {
          p_all_day: boolean
          p_end_at: string
          p_end_tz: string
          p_kind: string
          p_note: string
          p_participant_member_ids: string[]
          p_place_name: string
          p_start_at: string
          p_start_tz: string
          p_title: string
          p_trip_id: string
          p_visibility: string
        }
        Returns: string
      }
      create_event_with_place: {
        Args: {
          p_all_day: boolean
          p_end_at: string
          p_end_tz: string
          p_formatted_address: string
          p_google_place_id: string
          p_icon: string
          p_kind: string
          p_lat: number
          p_lng: number
          p_locality: string
          p_note: string
          p_participant_member_ids: string[]
          p_place_name: string
          p_region: string
          p_start_at: string
          p_start_tz: string
          p_title: string
          p_trip_id: string
          p_visibility: string
        }
        Returns: string
      }
      create_expense: {
        Args: {
          p_category_id: string
          p_local_currency: string
          p_local_price: number
          p_note: string
          p_paid_at: string
          p_payer_member_id: string
          p_place_id: string
          p_rate_to_default: number
          p_split_member_ids: string[]
          p_splittable: boolean
          p_trip_id: string
          p_tz: string
          p_visibility: string
        }
        Returns: string
      }
      create_expense_with_freetext_place: {
        Args: {
          p_category_id: string
          p_local_currency: string
          p_local_price: number
          p_note: string
          p_paid_at: string
          p_payer_member_id: string
          p_place_name: string
          p_rate_to_default: number
          p_split_member_ids: string[]
          p_splittable: boolean
          p_trip_id: string
          p_tz: string
          p_visibility: string
        }
        Returns: string
      }
      create_expense_with_place: {
        Args: {
          p_category_id: string
          p_formatted_address: string
          p_google_place_id: string
          p_icon: string
          p_lat: number
          p_lng: number
          p_local_currency: string
          p_local_price: number
          p_locality: string
          p_note: string
          p_paid_at: string
          p_payer_member_id: string
          p_place_name: string
          p_rate_to_default: number
          p_region: string
          p_split_member_ids: string[]
          p_splittable: boolean
          p_trip_id: string
          p_tz: string
          p_visibility: string
        }
        Returns: string
      }
      create_place: {
        Args: {
          p_formatted_address: string
          p_google_place_id: string
          p_icon: string
          p_lat: number
          p_lng: number
          p_locality: string
          p_name: string
          p_note: string
          p_region: string
          p_status_id: string
          p_trip_id: string
          p_visibility: string
        }
        Returns: string
      }
      create_todo: {
        Args: {
          p_kind: string
          p_priority: string
          p_title: string
          p_trip_id: string
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
      ensure_import_token: { Args: never; Returns: string }
      ensure_trip_invite: {
        Args: { p_token: string; p_trip_id: string }
        Returns: string
      }
      find_or_create_trip_freetext_place: {
        Args: { p_member_id: string; p_name: string; p_trip_id: string }
        Returns: string
      }
      find_or_create_trip_place: {
        Args: {
          p_formatted_address: string
          p_google_place_id: string
          p_icon: string
          p_lat: number
          p_lng: number
          p_locality: string
          p_member_id: string
          p_name: string
          p_region: string
          p_trip_id: string
        }
        Returns: string
      }
      is_active_trip_member: { Args: { _trip_id: string }; Returns: boolean }
      is_own_member: { Args: { _member_id: string }; Returns: boolean }
      is_trip_admin: { Args: { _trip_id: string }; Returns: boolean }
      join_trip_via_invite: {
        Args: { p_display_name: string; p_token: string }
        Returns: string
      }
      nanoid: { Args: { size?: number }; Returns: string }
      peek_invite: { Args: { p_token: string }; Returns: string }
      pick_member_color: { Args: { p_trip_id: string }; Returns: number }
      regenerate_trip_invite: {
        Args: { p_token: string; p_trip_id: string }
        Returns: string
      }
      remove_trip_member: { Args: { p_member_id: string }; Returns: undefined }
      resolve_inbound_email: {
        Args: { p_expense_id?: string; p_id: string; p_status: string }
        Returns: undefined
      }
      seed_default_expense_categories: {
        Args: { _trip_id: string }
        Returns: undefined
      }
      seed_default_place_statuses: {
        Args: { _trip_id: string }
        Returns: undefined
      }
      seed_default_trip_pin_options: {
        Args: { _trip_id: string }
        Returns: undefined
      }
      set_event_reservation: {
        Args: { p_event_id: string; p_needs: boolean }
        Returns: undefined
      }
      set_place_location: {
        Args: { p_lat: number; p_lng: number; p_place_id: string }
        Returns: undefined
      }
      unmerge_inbound_email: { Args: { p_id: string }; Returns: undefined }
      update_event: {
        Args: {
          p_all_day: boolean
          p_end_at: string
          p_end_tz: string
          p_event_id: string
          p_kind: string
          p_note: string
          p_participant_member_ids: string[]
          p_place_id: string
          p_start_at: string
          p_start_tz: string
          p_title: string
          p_visibility: string
        }
        Returns: undefined
      }
      update_event_with_freetext_place: {
        Args: {
          p_all_day: boolean
          p_end_at: string
          p_end_tz: string
          p_event_id: string
          p_kind: string
          p_note: string
          p_participant_member_ids: string[]
          p_place_name: string
          p_start_at: string
          p_start_tz: string
          p_title: string
          p_visibility: string
        }
        Returns: undefined
      }
      update_event_with_place: {
        Args: {
          p_all_day: boolean
          p_end_at: string
          p_end_tz: string
          p_event_id: string
          p_formatted_address: string
          p_google_place_id: string
          p_icon: string
          p_kind: string
          p_lat: number
          p_lng: number
          p_locality: string
          p_note: string
          p_participant_member_ids: string[]
          p_place_name: string
          p_region: string
          p_start_at: string
          p_start_tz: string
          p_title: string
          p_visibility: string
        }
        Returns: undefined
      }
      update_expense: {
        Args: {
          p_category_id: string
          p_expense_id: string
          p_local_currency: string
          p_local_price: number
          p_note: string
          p_paid_at: string
          p_payer_member_id: string
          p_place_id: string
          p_rate_to_default: number
          p_split_member_ids: string[]
          p_splittable: boolean
          p_tz: string
          p_visibility: string
        }
        Returns: undefined
      }
      update_expense_with_freetext_place: {
        Args: {
          p_category_id: string
          p_expense_id: string
          p_local_currency: string
          p_local_price: number
          p_note: string
          p_paid_at: string
          p_payer_member_id: string
          p_place_name: string
          p_rate_to_default: number
          p_split_member_ids: string[]
          p_splittable: boolean
          p_tz: string
          p_visibility: string
        }
        Returns: undefined
      }
      update_expense_with_place: {
        Args: {
          p_category_id: string
          p_expense_id: string
          p_formatted_address: string
          p_google_place_id: string
          p_icon: string
          p_lat: number
          p_lng: number
          p_local_currency: string
          p_local_price: number
          p_locality: string
          p_note: string
          p_paid_at: string
          p_payer_member_id: string
          p_place_name: string
          p_rate_to_default: number
          p_region: string
          p_split_member_ids: string[]
          p_splittable: boolean
          p_tz: string
          p_visibility: string
        }
        Returns: undefined
      }
      update_place: {
        Args: {
          p_icon: string
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
