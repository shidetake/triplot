// triplot のテーブル型定義（手書き）
// 後で `supabase gen types typescript --linked > lib/types/database.ts` で置き換え可能。
// Row / Insert / Update の3形式は @supabase/supabase-js の型推論と互換。

export type Visibility = "shared" | "private";
export type Currency = "JPY" | "USD";
export type TripStatus = "planning" | "ongoing" | "finished";
export type MemberKind = "member" | "guest";

export type Database = {
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
      };
      trip_members: {
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
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_active_trip_member: {
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
