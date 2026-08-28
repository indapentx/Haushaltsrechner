/**
 * Hand-written to match supabase/schema.sql. Keep the two in step: change a
 * column there, change it here, and `tsc` points at every call site that
 * needs updating.
 *
 * These must be `type` aliases, not interfaces — supabase-js requires the
 * implicit index signature that only type aliases get.
 */

type ProfileRow = {
  id: string;
  user_id: string;
  name: string;
  currency: string;
  sort_order: number;
  created_at: string;
};

type CycleRow = {
  id: string;
  profile_id: string;
  start_date: string;
  income: number;
  created_at: string;
};

type ItemRow = {
  id: string;
  cycle_id: string;
  name: string;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
  sort_order: number;
  created_at: string;
};

/** Columns with database defaults are optional on insert. */
type Defaulted<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Defaulted<ProfileRow, 'id' | 'created_at' | 'currency' | 'sort_order'>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      cycles: {
        Row: CycleRow;
        Insert: Defaulted<CycleRow, 'id' | 'created_at' | 'income'>;
        Update: Partial<CycleRow>;
        Relationships: [];
      };
      items: {
        Row: ItemRow;
        Insert: Defaulted<
          ItemRow,
          'id' | 'created_at' | 'amount' | 'is_paid' | 'paid_at' | 'sort_order'
        >;
        Update: Partial<ItemRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      ensure_cycle: {
        Args: { p_profile_id: string; p_start: string };
        Returns: CycleRow;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
