export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_closed: boolean
          is_current: boolean
          name: string
          school_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_closed?: boolean
          is_current?: boolean
          name: string
          school_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_closed?: boolean
          is_current?: boolean
          name?: string
          school_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          school_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          school_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          joined_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string | null
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      number_sequences: {
        Row: {
          created_at: string
          current_value: number
          id: string
          kind: string
          padding: number
          prefix: string
          school_id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          current_value?: number
          id?: string
          kind: string
          padding?: number
          prefix?: string
          school_id: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          current_value?: number
          id?: string
          kind?: string
          padding?: number
          prefix?: string
          school_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "number_sequences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          full_name: string | null
          id: string
          is_platform_admin: boolean
          last_name: string | null
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          last_name?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          last_name?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      school_calendar: {
        Row: {
          academic_year_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          school_id: string
          start_date: string
          type: Database["public"]["Enums"]["calendar_event_type"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          school_id: string
          start_date: string
          type?: Database["public"]["Enums"]["calendar_event_type"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          school_id?: string
          start_date?: string
          type?: Database["public"]["Enums"]["calendar_event_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_calendar_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_calendar_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          is_active: boolean
          locale: string
          logo_url: string | null
          name: string
          phone: string | null
          settings: Json
          slug: string
          timezone: string
          type: Database["public"]["Enums"]["school_type"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          settings?: Json
          slug: string
          timezone?: string
          type?: Database["public"]["Enums"]["school_type"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          settings?: Json
          slug?: string
          timezone?: string
          type?: Database["public"]["Enums"]["school_type"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      teachers: {
        Row: {
          address: string | null
          birth_date: string | null
          contract_type: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          employee_no: string | null
          first_name: string
          full_name: string | null
          gender: string | null
          hire_date: string | null
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          profile_id: string | null
          school_id: string
          speciality: string | null
          status: Database["public"]["Enums"]["staff_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          contract_type?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          employee_no?: string | null
          first_name: string
          full_name?: string | null
          gender?: string | null
          hire_date?: string | null
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          school_id: string
          speciality?: string | null
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          contract_type?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          employee_no?: string | null
          first_name?: string
          full_name?: string | null
          gender?: string | null
          hire_date?: string | null
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          school_id?: string
          speciality?: string | null
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          is_locked: boolean
          kind: Database["public"]["Enums"]["term_kind"]
          name: string
          school_id: string
          sequence: number
          start_date: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          is_locked?: boolean
          kind?: Database["public"]["Enums"]["term_kind"]
          name: string
          school_id: string
          sequence: number
          start_date: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          is_locked?: boolean
          kind?: Database["public"]["Enums"]["term_kind"]
          name?: string
          school_id?: string
          sequence?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      school_members: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          has_signed_in: boolean | null
          id: string | null
          invited_at: string | null
          is_active: boolean | null
          joined_at: string | null
          last_name: string | null
          last_sign_in_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          school_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_directory: {
        Row: {
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string | null
          last_name: string | null
          photo_url: string | null
          school_id: string | null
          speciality: string | null
          status: Database["public"]["Enums"]["staff_status"] | null
        }
        Insert: {
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string | null
          last_name?: string | null
          photo_url?: string | null
          school_id?: string | null
          speciality?: string | null
          status?: Database["public"]["Enums"]["staff_status"] | null
        }
        Update: {
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string | null
          last_name?: string | null
          photo_url?: string | null
          school_id?: string | null
          speciality?: string | null
          status?: Database["public"]["Enums"]["staff_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_school: {
        Args: {
          p_currency?: string
          p_name: string
          p_slug: string
          p_timezone?: string
          p_type?: Database["public"]["Enums"]["school_type"]
        }
        Returns: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          is_active: boolean
          locale: string
          logo_url: string | null
          name: string
          phone: string | null
          settings: Json
          slug: string
          timezone: string
          type: Database["public"]["Enums"]["school_type"]
          updated_at: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "schools"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      find_user_id_by_email: {
        Args: { p_email: string; p_school: string }
        Returns: string
      }
      next_number: {
        Args: { p_kind: string; p_school: string; p_year?: number }
        Returns: string
      }
      timemultirange: { Args: never; Returns: unknown }
    }
    Enums: {
      calendar_event_type: "holiday" | "exam_period" | "closure" | "event"
      school_type:
        | "preschool"
        | "primary"
        | "middle_school"
        | "high_school"
        | "vocational"
        | "university"
        | "other"
      staff_status: "active" | "on_leave" | "suspended" | "left"
      term_kind: "trimester" | "semester" | "quarter" | "year"
      user_role:
        | "super_admin"
        | "school_admin"
        | "teacher"
        | "student"
        | "parent"
        | "accountant"
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
      calendar_event_type: ["holiday", "exam_period", "closure", "event"],
      school_type: [
        "preschool",
        "primary",
        "middle_school",
        "high_school",
        "vocational",
        "university",
        "other",
      ],
      staff_status: ["active", "on_leave", "suspended", "left"],
      term_kind: ["trimester", "semester", "quarter", "year"],
      user_role: [
        "super_admin",
        "school_admin",
        "teacher",
        "student",
        "parent",
        "accountant",
      ],
    },
  },
} as const

