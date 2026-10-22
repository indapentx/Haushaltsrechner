/**
 * Hand-written to match supabase/migrations/. Keep them in step: change a
 * column there, change it here, and `tsc` points at every call site that
 * needs updating.
 *
 * These must be `type` aliases, not interfaces — supabase-js requires the
 * implicit index signature that only type aliases get.
 */

type HouseholdRow = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
};

type HouseholdMemberRow = {
  household_id: string;
  user_id: string;
  role: 'owner' | 'member';
  display_name: string | null;
  joined_at: string;
};

type HouseholdInviteRow = {
  code: string;
  household_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
};

type ProfileRow = {
  id: string;
  household_id: string;
  name: string;
  currency: string;
  sort_order: number;
  created_at: string;
};

type CycleRow = {
  id: string;
  profile_id: string;
  start_date: string;
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
  currency: string;
  rate_date: string;
  rate_override: number | null;
  created_at: string;
};

type IncomeRow = {
  id: string;
  cycle_id: string;
  name: string;
  amount: number;
  currency: string;
  rate_date: string;
  rate_override: number | null;
  sort_order: number;
  created_at: string;
};

type FxRateRow = {
  as_of: string;
  base: string;
  quote: string;
  rate: number;
  fetched_at: string;
};

/** Columns with database defaults are optional on insert. */
type Defaulted<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  public: {
    Tables: {
      households: {
        Row: HouseholdRow;
        Insert: Defaulted<HouseholdRow, 'id' | 'created_at' | 'created_by'>;
        Update: Partial<HouseholdRow>;
        Relationships: [];
      };
      household_members: {
        Row: HouseholdMemberRow;
        Insert: Defaulted<HouseholdMemberRow, 'role' | 'display_name' | 'joined_at'>;
        Update: Partial<HouseholdMemberRow>;
        Relationships: [];
      };
      household_invites: {
        Row: HouseholdInviteRow;
        Insert: Defaulted<
          HouseholdInviteRow,
          'created_by' | 'created_at' | 'expires_at' | 'max_uses' | 'uses'
        >;
        Update: Partial<HouseholdInviteRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Defaulted<ProfileRow, 'id' | 'created_at' | 'currency' | 'sort_order'>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      cycles: {
        Row: CycleRow;
        Insert: Defaulted<CycleRow, 'id' | 'created_at'>;
        Update: Partial<CycleRow>;
        Relationships: [];
      };
      items: {
        Row: ItemRow;
        Insert: Defaulted<
          ItemRow,
          | 'id'
          | 'created_at'
          | 'amount'
          | 'is_paid'
          | 'paid_at'
          | 'sort_order'
          | 'currency'
          | 'rate_date'
          | 'rate_override'
        >;
        Update: Partial<ItemRow>;
        Relationships: [];
      };
      incomes: {
        Row: IncomeRow;
        Insert: Defaulted<
          IncomeRow,
          'id' | 'created_at' | 'name' | 'amount' | 'rate_date' | 'rate_override' | 'sort_order'
        >;
        Update: Partial<IncomeRow>;
        Relationships: [];
      };
      fx_rates: {
        Row: FxRateRow;
        Insert: Defaulted<FxRateRow, 'fetched_at'>;
        Update: Partial<FxRateRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      ensure_cycle: {
        Args: { p_profile_id: string; p_start: string };
        Returns: CycleRow;
      };
      create_household: {
        Args: { p_name: string };
        Returns: HouseholdRow;
      };
      join_household: {
        Args: { p_code: string };
        Returns: HouseholdRow;
      };
      rotate_join_code: {
        Args: { p_household: string };
        Returns: string;
      };
      household_member_list: {
        Args: { p_household: string };
        Returns: {
          user_id: string;
          email: string;
          role: 'owner' | 'member';
          display_name: string | null;
          joined_at: string;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
