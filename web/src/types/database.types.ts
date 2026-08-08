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
      class_subjects: {
        Row: {
          class_id: string
          coefficient: number
          created_at: string
          credits: number | null
          id: string
          is_optional: boolean
          max_score: number
          school_id: string
          subject_id: string
          teacher_id: string | null
          updated_at: string
          weekly_hours: number | null
        }
        Insert: {
          class_id: string
          coefficient?: number
          created_at?: string
          credits?: number | null
          id?: string
          is_optional?: boolean
          max_score?: number
          school_id: string
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
          weekly_hours?: number | null
        }
        Update: {
          class_id?: string
          coefficient?: number
          created_at?: string
          credits?: number | null
          id?: string
          is_optional?: boolean
          max_score?: number
          school_id?: string
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "class_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "timetable_view"
            referencedColumns: ["subject_id"]
          },
          {
            foreignKeyName: "class_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year_id: string
          capacity: number | null
          code: string | null
          created_at: string
          default_room_id: string | null
          id: string
          level_id: string
          main_teacher_id: string | null
          name: string
          program_id: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          capacity?: number | null
          code?: string | null
          created_at?: string
          default_room_id?: string | null
          id?: string
          level_id: string
          main_teacher_id?: string | null
          name: string
          program_id?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          capacity?: number | null
          code?: string | null
          created_at?: string
          default_room_id?: string | null
          id?: string
          level_id?: string
          main_teacher_id?: string | null
          name?: string
          program_id?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_default_room_id_fkey"
            columns: ["default_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "classes_main_teacher_id_fkey"
            columns: ["main_teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_main_teacher_id_fkey"
            columns: ["main_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          enrolled_at: string
          id: string
          is_repeating: boolean
          school_id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at: string
          withdrawal_reason: string | null
          withdrawn_at: string | null
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          is_repeating?: boolean
          school_id: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at?: string
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          is_repeating?: boolean
          school_id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          updated_at?: string
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          first_name: string
          full_name: string | null
          id: string
          last_name: string
          national_id: string | null
          phone: string | null
          profession: string | null
          profile_id: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          full_name?: string | null
          id?: string
          last_name: string
          national_id?: string | null
          phone?: string | null
          profession?: string | null
          profile_id?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          full_name?: string | null
          id?: string
          last_name?: string
          national_id?: string | null
          phone?: string | null
          profession?: string | null
          profile_id?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          entity: string
          error_rows: number
          errors: Json
          filename: string
          id: string
          options: Json
          school_id: string
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string | null
          success_rows: number
          total_rows: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity: string
          error_rows?: number
          errors?: Json
          filename: string
          id?: string
          options?: Json
          school_id: string
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          success_rows?: number
          total_rows?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity?: string
          error_rows?: number
          errors?: Json
          filename?: string
          id?: string
          options?: Json
          school_id?: string
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          success_rows?: number
          total_rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          cancellation_reason: string | null
          class_id: string
          class_subject_id: string | null
          created_at: string
          date: string
          end_time: string
          homework: string | null
          id: string
          room_id: string | null
          school_id: string
          start_time: string
          status: Database["public"]["Enums"]["lesson_status"]
          subject_id: string | null
          substitute_teacher_id: string | null
          teacher_id: string | null
          timetable_slot_id: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          class_id: string
          class_subject_id?: string | null
          created_at?: string
          date: string
          end_time: string
          homework?: string | null
          id?: string
          room_id?: string | null
          school_id: string
          start_time: string
          status?: Database["public"]["Enums"]["lesson_status"]
          subject_id?: string | null
          substitute_teacher_id?: string | null
          teacher_id?: string | null
          timetable_slot_id?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          class_id?: string
          class_subject_id?: string | null
          created_at?: string
          date?: string
          end_time?: string
          homework?: string | null
          id?: string
          room_id?: string | null
          school_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["lesson_status"]
          subject_id?: string | null
          substitute_teacher_id?: string | null
          teacher_id?: string | null
          timetable_slot_id?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "lessons_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "timetable_view"
            referencedColumns: ["subject_id"]
          },
          {
            foreignKeyName: "lessons_substitute_teacher_id_fkey"
            columns: ["substitute_teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_substitute_teacher_id_fkey"
            columns: ["substitute_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_timetable_slot_id_fkey"
            columns: ["timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_timetable_slot_id_fkey"
            columns: ["timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_view"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
        Row: {
          code: string | null
          created_at: string
          cycle: Database["public"]["Enums"]["school_cycle"]
          id: string
          name: string
          order_index: number
          school_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          cycle?: Database["public"]["Enums"]["school_cycle"]
          id?: string
          name: string
          order_index?: number
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          cycle?: Database["public"]["Enums"]["school_cycle"]
          id?: string
          name?: string
          order_index?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "levels_school_id_fkey"
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
      programs: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          head_teacher_id: string | null
          id: string
          is_active: boolean
          level_id: string | null
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          head_teacher_id?: string | null
          id?: string
          is_active?: boolean
          level_id?: string | null
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          head_teacher_id?: string | null
          id?: string
          is_active?: boolean
          level_id?: string | null
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_head_teacher_id_fkey"
            columns: ["head_teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_head_teacher_id_fkey"
            columns: ["head_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "programs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          building: string | null
          capacity: number | null
          code: string | null
          created_at: string
          floor: string | null
          id: string
          is_active: boolean
          name: string
          school_id: string
          type: Database["public"]["Enums"]["room_type"]
          updated_at: string
        }
        Insert: {
          building?: string | null
          capacity?: number | null
          code?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          type?: Database["public"]["Enums"]["room_type"]
          updated_at?: string
        }
        Update: {
          building?: string | null
          capacity?: number | null
          code?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          type?: Database["public"]["Enums"]["room_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      student_documents: {
        Row: {
          created_at: string
          id: string
          label: string
          mime_type: string | null
          school_id: string
          size_bytes: number | null
          storage_path: string
          student_id: string
          type: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          mime_type?: string | null
          school_id: string
          size_bytes?: number | null
          storage_path: string
          student_id: string
          type?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          mime_type?: string | null
          school_id?: string
          size_bytes?: number | null
          storage_path?: string
          student_id?: string
          type?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          can_pick_up: boolean
          created_at: string
          guardian_id: string
          is_legal_guardian: boolean
          is_primary: boolean
          receives_invoices: boolean
          relationship: Database["public"]["Enums"]["guardian_relationship"]
          school_id: string
          student_id: string
        }
        Insert: {
          can_pick_up?: boolean
          created_at?: string
          guardian_id: string
          is_legal_guardian?: boolean
          is_primary?: boolean
          receives_invoices?: boolean
          relationship?: Database["public"]["Enums"]["guardian_relationship"]
          school_id: string
          student_id: string
        }
        Update: {
          can_pick_up?: boolean
          created_at?: string
          guardian_id?: string
          is_legal_guardian?: boolean
          is_primary?: boolean
          receives_invoices?: boolean
          relationship?: Database["public"]["Enums"]["guardian_relationship"]
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          blood_group: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          entry_date: string | null
          exit_date: string | null
          first_name: string
          full_name: string | null
          gender: string | null
          id: string
          last_name: string
          matricule: string
          medical_notes: string | null
          nationality: string | null
          notes: string | null
          phone: string | null
          photo_url: string | null
          previous_school: string | null
          profile_id: string | null
          school_id: string
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          blood_group?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          entry_date?: string | null
          exit_date?: string | null
          first_name: string
          full_name?: string | null
          gender?: string | null
          id?: string
          last_name: string
          matricule: string
          medical_notes?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          previous_school?: string | null
          profile_id?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          blood_group?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          entry_date?: string | null
          exit_date?: string | null
          first_name?: string
          full_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string
          matricule?: string
          medical_notes?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          previous_school?: string | null
          profile_id?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_levels: {
        Row: {
          created_at: string
          default_coefficient: number
          default_credits: number | null
          default_max_score: number
          default_weekly_hours: number | null
          level_id: string
          school_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_coefficient?: number
          default_credits?: number | null
          default_max_score?: number
          default_weekly_hours?: number | null
          level_id: string
          school_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_coefficient?: number
          default_credits?: number | null
          default_max_score?: number
          default_weekly_hours?: number | null
          level_id?: string
          school_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_levels_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_levels_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "subject_levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_levels_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_levels_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "timetable_view"
            referencedColumns: ["subject_id"]
          },
        ]
      }
      subjects: {
        Row: {
          category: string | null
          code: string | null
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      timetable_slots: {
        Row: {
          academic_year_id: string
          class_id: string
          class_subject_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          room_id: string | null
          school_id: string
          start_time: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          class_subject_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          room_id?: string | null
          school_id: string
          start_time: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          class_subject_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          room_id?: string | null
          school_id?: string
          start_time?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "timetable_slots_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      class_overview: {
        Row: {
          academic_year_id: string | null
          capacity: number | null
          code: string | null
          created_at: string | null
          default_room_id: string | null
          default_room_name: string | null
          enrolled_count: number | null
          fill_rate: number | null
          id: string | null
          level_cycle: Database["public"]["Enums"]["school_cycle"] | null
          level_id: string | null
          level_name: string | null
          level_order: number | null
          main_teacher_id: string | null
          main_teacher_name: string | null
          name: string | null
          program_id: string | null
          program_name: string | null
          school_id: string | null
          subject_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_default_room_id_fkey"
            columns: ["default_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "classes_main_teacher_id_fkey"
            columns: ["main_teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_main_teacher_id_fkey"
            columns: ["main_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
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
      student_overview: {
        Row: {
          academic_year_id: string | null
          birth_date: string | null
          city: string | null
          class_id: string | null
          class_name: string | null
          created_at: string | null
          email: string | null
          enrolled_at: string | null
          enrollment_id: string | null
          enrollment_status:
            | Database["public"]["Enums"]["enrollment_status"]
            | null
          entry_date: string | null
          first_name: string | null
          full_name: string | null
          gender: string | null
          id: string | null
          is_repeating: boolean | null
          last_name: string | null
          level_id: string | null
          level_name: string | null
          matricule: string | null
          phone: string | null
          photo_url: string | null
          profile_id: string | null
          program_id: string | null
          program_name: string | null
          school_id: string | null
          status: Database["public"]["Enums"]["student_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
      teacher_workload: {
        Row: {
          academic_year_id: string | null
          class_count: number | null
          school_id: string | null
          slot_count: number | null
          teacher_id: string | null
          weekly_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_view: {
        Row: {
          academic_year_id: string | null
          class_id: string | null
          class_name: string | null
          class_subject_id: string | null
          coefficient: number | null
          day_of_week: number | null
          end_time: string | null
          id: string | null
          level_name: string | null
          room_id: string | null
          room_name: string | null
          school_id: string | null
          start_time: string | null
          subject_code: string | null
          subject_color: string | null
          subject_id: string | null
          subject_name: string | null
          teacher_id: string | null
          teacher_name: string | null
          weekly_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "timetable_slots_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_subject_template: { Args: { p_class_id: string }; Returns: number }
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
      enroll_students: {
        Args: {
          p_class_id: string
          p_is_repeating?: boolean
          p_student_ids: string[]
        }
        Returns: number
      }
      find_user_id_by_email: {
        Args: { p_email: string; p_school: string }
        Returns: string
      }
      generate_lessons: {
        Args: { p_class_id: string; p_from: string; p_to: string }
        Returns: number
      }
      next_number: {
        Args: { p_kind: string; p_school: string; p_year?: number }
        Returns: string
      }
      timemultirange: { Args: never; Returns: unknown }
    }
    Enums: {
      calendar_event_type: "holiday" | "exam_period" | "closure" | "event"
      enrollment_status:
        | "active"
        | "transferred"
        | "withdrawn"
        | "repeating"
        | "completed"
      guardian_relationship:
        | "father"
        | "mother"
        | "stepparent"
        | "grandparent"
        | "sibling"
        | "tutor"
        | "other"
      import_status: "pending" | "processing" | "completed" | "failed"
      lesson_status: "planned" | "held" | "cancelled" | "replaced"
      room_type:
        | "classroom"
        | "lab"
        | "amphitheater"
        | "workshop"
        | "gym"
        | "library"
        | "other"
      school_cycle: "preschool" | "primary" | "middle" | "high" | "higher"
      school_type:
        | "preschool"
        | "primary"
        | "middle_school"
        | "high_school"
        | "vocational"
        | "university"
        | "other"
      staff_status: "active" | "on_leave" | "suspended" | "left"
      student_status:
        | "enrolled"
        | "graduated"
        | "transferred"
        | "withdrawn"
        | "suspended"
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
      enrollment_status: [
        "active",
        "transferred",
        "withdrawn",
        "repeating",
        "completed",
      ],
      guardian_relationship: [
        "father",
        "mother",
        "stepparent",
        "grandparent",
        "sibling",
        "tutor",
        "other",
      ],
      import_status: ["pending", "processing", "completed", "failed"],
      lesson_status: ["planned", "held", "cancelled", "replaced"],
      room_type: [
        "classroom",
        "lab",
        "amphitheater",
        "workshop",
        "gym",
        "library",
        "other",
      ],
      school_cycle: ["preschool", "primary", "middle", "high", "higher"],
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
      student_status: [
        "enrolled",
        "graduated",
        "transferred",
        "withdrawn",
        "suspended",
      ],
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

