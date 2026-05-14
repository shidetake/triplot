// triplot のテーブル型定義（手書き）
// 後で `supabase gen types typescript --linked > lib/types/database.ts` で置き換え可能。
// 各テーブルに Relationships: [] を持たせるのは postgrest-js の GenericTable 要件。

export type Visibility = "shared" | "private";
export type Currency = "JPY" | "USD";
export type TripStatus = "planning" | "ongoing" | "finished";
export type MemberKind = "member" | "guest";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          google_uid: string | null;
          display_name: string | null;
          is_anonymous: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          google_uid?: string | null;
          display_name?: string | null;
          is_anonymous?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          google_uid?: string | null;
          display_name?: string | null;
          is_anonymous?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      trips: {
        Row: {
          id: string;
          title: string;
          start_date: string | null;
          end_date: string | null;
          status: TripStatus;
          default_currency: Currency;
          last_activity_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          start_date?: string | null;
          end_date?: string | null;
          status?: TripStatus;
          default_currency?: Currency;
          last_activity_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          start_date?: string | null;
          end_date?: string | null;
          status?: TripStatus;
          default_currency?: Currency;
          last_activity_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      trip_members: {
        // trip_id は text(10) の短い ID
        Row: {
          id: string;
          trip_id: string;
          user_id: string;
          display_name: string;
          color: string | null;
          kind: MemberKind;
          joined_at: string;
          left_at: string | null;
        };
        Insert: {
          id?: string;
          trip_id: string;
          user_id: string;
          display_name: string;
          color?: string | null;
          kind: MemberKind;
          joined_at?: string;
          left_at?: string | null;
        };
        Update: {
          id?: string;
          trip_id?: string;
          user_id?: string;
          display_name?: string;
          color?: string | null;
          kind?: MemberKind;
          joined_at?: string;
          left_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_invites: {
        Row: {
          trip_id: string;
          token_hash: string;
        };
        Insert: {
          trip_id: string;
          token_hash: string;
        };
        Update: {
          trip_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_invites_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_exchange_rates: {
        Row: {
          trip_id: string;
          currency: Currency;
          rate_to_default: number;
        };
        Insert: {
          trip_id: string;
          currency: Currency;
          rate_to_default: number;
        };
        Update: {
          trip_id?: string;
          currency?: Currency;
          rate_to_default?: number;
        };
        Relationships: [
          {
            foreignKeyName: "trip_exchange_rates_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      places: {
        Row: {
          id: string;
          trip_id: string;
          created_by_member_id: string;
          visibility: Visibility;
          google_place_id: string | null;
          name: string;
          lat: number | null;
          lng: number | null;
          status: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          created_by_member_id: string;
          visibility: Visibility;
          google_place_id?: string | null;
          name: string;
          lat?: number | null;
          lng?: number | null;
          status?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          created_by_member_id?: string;
          visibility?: Visibility;
          google_place_id?: string | null;
          name?: string;
          lat?: number | null;
          lng?: number | null;
          status?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "places_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "places_created_by_member_id_fkey";
            columns: ["created_by_member_id"];
            isOneToOne: false;
            referencedRelation: "trip_members";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          trip_id: string;
          created_by_member_id: string;
          visibility: Visibility;
          title: string;
          start_at: string;
          end_at: string | null;
          place_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          created_by_member_id: string;
          visibility: Visibility;
          title: string;
          start_at: string;
          end_at?: string | null;
          place_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          created_by_member_id?: string;
          visibility?: Visibility;
          title?: string;
          start_at?: string;
          end_at?: string | null;
          place_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_created_by_member_id_fkey";
            columns: ["created_by_member_id"];
            isOneToOne: false;
            referencedRelation: "trip_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          trip_id: string;
          created_by_member_id: string;
          visibility: Visibility;
          amount: number;
          currency: Currency;
          payer_member_id: string;
          splittable: boolean;
          note: string | null;
          paid_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          created_by_member_id: string;
          visibility: Visibility;
          amount: number;
          currency: Currency;
          payer_member_id: string;
          splittable?: boolean;
          note?: string | null;
          paid_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          created_by_member_id?: string;
          visibility?: Visibility;
          amount?: number;
          currency?: Currency;
          payer_member_id?: string;
          splittable?: boolean;
          note?: string | null;
          paid_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_created_by_member_id_fkey";
            columns: ["created_by_member_id"];
            isOneToOne: false;
            referencedRelation: "trip_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_payer_member_id_fkey";
            columns: ["payer_member_id"];
            isOneToOne: false;
            referencedRelation: "trip_members";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_splits: {
        Row: {
          expense_id: string;
          member_id: string;
        };
        Insert: {
          expense_id: string;
          member_id: string;
        };
        Update: {
          expense_id?: string;
          member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_splits_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "trip_members";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_trip: {
        Args: {
          p_title: string;
          p_start_date: string | null;
          p_end_date: string | null;
          p_default_currency: "JPY" | "USD";
          p_display_name: string;
          p_usd_to_jpy_rate?: number | null;
        };
        Returns: string;
      };
      create_expense: {
        Args: {
          p_trip_id: string;
          p_amount: number;
          p_currency: Currency;
          p_payer_member_id: string;
          p_visibility: Visibility;
          p_splittable: boolean;
          p_note: string | null;
          p_paid_at: string | null;
          p_split_member_ids: string[];
        };
        Returns: string;
      };
      is_active_trip_member: {
        // _trip_id は trips.id（text）
        Args: { _trip_id: string };
        Returns: boolean;
      };
      is_own_member: {
        Args: { _member_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
