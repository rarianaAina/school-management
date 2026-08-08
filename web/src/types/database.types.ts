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
      assessment_types: {
        Row: {
          code: string | null
          created_at: string
          default_weight: number
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          default_weight?: number
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          default_weight?: number
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessment_type_id: string | null
          class_subject_id: string
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          id: string
          is_published: boolean
          max_score: number
          school_id: string
          term_id: string
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          assessment_type_id?: string | null
          class_subject_id: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          is_published?: boolean
          max_score?: number
          school_id: string
          term_id: string
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          assessment_type_id?: string | null
          class_subject_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          is_published?: boolean
          max_score?: number
          school_id?: string
          term_id?: string
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessments_assessment_type_id_fkey"
            columns: ["assessment_type_id"]
            isOneToOne: false
            referencedRelation: "assessment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
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
      deliberations: {
        Row: {
          computed_average: number | null
          computed_decision: Database["public"]["Enums"]["exam_decision"] | null
          created_at: string
          credits_earned: number | null
          credits_required: number | null
          decided_at: string | null
          decided_by: string | null
          decision: Database["public"]["Enums"]["exam_decision"] | null
          exam_session_id: string
          id: string
          jury_comment: string | null
          resit_subject_ids: string[]
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          computed_average?: number | null
          computed_decision?:
            | Database["public"]["Enums"]["exam_decision"]
            | null
          created_at?: string
          credits_earned?: number | null
          credits_required?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["exam_decision"] | null
          exam_session_id: string
          id?: string
          jury_comment?: string | null
          resit_subject_ids?: string[]
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          computed_average?: number | null
          computed_decision?:
            | Database["public"]["Enums"]["exam_decision"]
            | null
          created_at?: string
          credits_earned?: number | null
          credits_required?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["exam_decision"] | null
          exam_session_id?: string
          id?: string
          jury_comment?: string | null
          resit_subject_ids?: string[]
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliberations_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliberations_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_session_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliberations_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliberations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliberations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliberations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      exam_registrations: {
        Row: {
          convocation_number: string | null
          convocation_pdf_path: string | null
          created_at: string
          exam_room_id: string | null
          exam_session_id: string
          id: string
          school_id: string
          seat_number: number | null
          status: Database["public"]["Enums"]["registration_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          convocation_number?: string | null
          convocation_pdf_path?: string | null
          created_at?: string
          exam_room_id?: string | null
          exam_session_id: string
          id?: string
          school_id: string
          seat_number?: number | null
          status?: Database["public"]["Enums"]["registration_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          convocation_number?: string | null
          convocation_pdf_path?: string | null
          created_at?: string
          exam_room_id?: string | null
          exam_session_id?: string
          id?: string
          school_id?: string
          seat_number?: number | null
          status?: Database["public"]["Enums"]["registration_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_registrations_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_registrations_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_session_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_registrations_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_registrations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_results: {
        Row: {
          exam_id: string
          graded_at: string
          graded_by: string | null
          id: string
          is_absent: boolean
          is_disqualified: boolean
          remark: string | null
          school_id: string
          score: number | null
          student_id: string
        }
        Insert: {
          exam_id: string
          graded_at?: string
          graded_by?: string | null
          id?: string
          is_absent?: boolean
          is_disqualified?: boolean
          remark?: string | null
          school_id: string
          score?: number | null
          student_id: string
        }
        Update: {
          exam_id?: string
          graded_at?: string
          graded_by?: string | null
          id?: string
          is_absent?: boolean
          is_disqualified?: boolean
          remark?: string | null
          school_id?: string
          score?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_rooms: {
        Row: {
          capacity: number | null
          exam_id: string
          id: string
          room_id: string
          school_id: string
        }
        Insert: {
          capacity?: number | null
          exam_id: string
          id?: string
          room_id: string
          school_id: string
        }
        Update: {
          capacity?: number | null
          exam_id?: string
          id?: string
          room_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_rooms_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          academic_year_id: string
          created_at: string
          end_date: string
          id: string
          instructions: string | null
          name: string
          school_id: string
          start_date: string
          status: Database["public"]["Enums"]["exam_session_status"]
          term_id: string | null
          type: Database["public"]["Enums"]["exam_session_type"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          end_date: string
          id?: string
          instructions?: string | null
          name: string
          school_id: string
          start_date: string
          status?: Database["public"]["Enums"]["exam_session_status"]
          term_id?: string | null
          type?: Database["public"]["Enums"]["exam_session_type"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          end_date?: string
          id?: string
          instructions?: string | null
          name?: string
          school_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["exam_session_status"]
          term_id?: string | null
          type?: Database["public"]["Enums"]["exam_session_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_supervisors: {
        Row: {
          exam_room_id: string
          id: string
          role: Database["public"]["Enums"]["supervisor_role"]
          school_id: string
          teacher_id: string
        }
        Insert: {
          exam_room_id: string
          id?: string
          role?: Database["public"]["Enums"]["supervisor_role"]
          school_id: string
          teacher_id: string
        }
        Update: {
          exam_room_id?: string
          id?: string
          role?: Database["public"]["Enums"]["supervisor_role"]
          school_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_supervisors_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_supervisors_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_supervisors_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_supervisors_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          class_id: string | null
          coefficient: number
          created_at: string
          date: string
          duration_minutes: number
          exam_session_id: string
          id: string
          instructions: string | null
          level_id: string | null
          max_score: number
          school_id: string
          start_time: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          coefficient?: number
          created_at?: string
          date: string
          duration_minutes?: number
          exam_session_id: string
          id?: string
          instructions?: string | null
          level_id?: string | null
          max_score?: number
          school_id: string
          start_time: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          coefficient?: number
          created_at?: string
          date?: string
          duration_minutes?: number
          exam_session_id?: string
          id?: string
          instructions?: string | null
          level_id?: string | null
          max_score?: number
          school_id?: string
          start_time?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "exams_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_session_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "timetable_view"
            referencedColumns: ["subject_id"]
          },
        ]
      }
      fee_categories: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_mandatory: boolean
          is_recurring: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_mandatory?: boolean
          is_recurring?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_mandatory?: boolean
          is_recurring?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_installments: {
        Row: {
          amount: number | null
          due_date: string
          fee_structure_id: string
          id: string
          label: string
          order_index: number
          percentage: number | null
          school_id: string
        }
        Insert: {
          amount?: number | null
          due_date: string
          fee_structure_id: string
          id?: string
          label: string
          order_index?: number
          percentage?: number | null
          school_id: string
        }
        Update: {
          amount?: number | null
          due_date?: string
          fee_structure_id?: string
          id?: string
          label?: string
          order_index?: number
          percentage?: number | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_installments_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_installments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          academic_year_id: string
          amount: number
          class_id: string | null
          created_at: string
          currency: string
          fee_category_id: string
          id: string
          is_active: boolean
          level_id: string | null
          program_id: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          amount: number
          class_id?: string | null
          created_at?: string
          currency?: string
          fee_category_id: string
          id?: string
          is_active?: boolean
          level_id?: string | null
          program_id?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          amount?: number
          class_id?: string | null
          created_at?: string
          currency?: string
          fee_category_id?: string
          id?: string
          is_active?: boolean
          level_id?: string | null
          program_id?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "fee_structures_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "fee_structures_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "fee_structures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          assessment_id: string
          comment: string | null
          created_at: string
          graded_at: string
          graded_by: string | null
          id: string
          is_absent: boolean
          is_excused: boolean
          school_id: string
          score: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          comment?: string | null
          created_at?: string
          graded_at?: string
          graded_by?: string | null
          id?: string
          is_absent?: boolean
          is_excused?: boolean
          school_id: string
          score?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          comment?: string | null
          created_at?: string
          graded_at?: string
          graded_by?: string | null
          id?: string
          is_absent?: boolean
          is_excused?: boolean
          school_id?: string
          score?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
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
      invoice_lines: {
        Row: {
          amount: number | null
          fee_category_id: string | null
          id: string
          invoice_id: string
          label: string
          quantity: number
          school_id: string
          student_fee_id: string | null
          unit_amount: number
        }
        Insert: {
          amount?: number | null
          fee_category_id?: string | null
          id?: string
          invoice_id: string
          label: string
          quantity?: number
          school_id: string
          student_fee_id?: string | null
          unit_amount: number
        }
        Update: {
          amount?: number | null
          fee_category_id?: string | null
          id?: string
          invoice_id?: string
          label?: string
          quantity?: number
          school_id?: string
          student_fee_id?: string | null
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_student_fee_id_fkey"
            columns: ["student_fee_id"]
            isOneToOne: false
            referencedRelation: "student_fees"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          academic_year_id: string
          balance: number | null
          created_at: string
          created_by: string | null
          currency: string
          due_date: string
          id: string
          issue_date: string
          notes: string | null
          number: string
          paid_amount: number
          pdf_path: string | null
          school_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          balance?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date: string
          id?: string
          issue_date?: string
          notes?: string | null
          number: string
          paid_amount?: number
          pdf_path?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          balance?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          number?: string
          paid_amount?: number
          pdf_path?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      payment_allocations: {
        Row: {
          amount: number
          id: string
          invoice_line_id: string
          payment_id: string
          school_id: string
        }
        Insert: {
          amount: number
          id?: string
          invoice_line_id: string
          payment_id: string
          school_id: string
        }
        Update: {
          amount?: number
          id?: string
          invoice_line_id?: string
          payment_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          channel: Database["public"]["Enums"]["reminder_channel"]
          error: string | null
          id: string
          invoice_id: string | null
          school_id: string
          sent_at: string
          sent_to: string | null
          status: string
          student_id: string
          template: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["reminder_channel"]
          error?: string | null
          id?: string
          invoice_id?: string | null
          school_id: string
          sent_at?: string
          sent_to?: string | null
          status?: string
          student_id: string
          template?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["reminder_channel"]
          error?: string | null
          id?: string
          invoice_id?: string | null
          school_id?: string
          sent_at?: string
          sent_to?: string | null
          status?: string
          student_id?: string
          template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_id: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string
          receipt_number: string
          receipt_pdf_path: string | null
          received_by: string | null
          reference: string | null
          school_id: string
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          receipt_number: string
          receipt_pdf_path?: string | null
          received_by?: string | null
          reference?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          receipt_number?: string
          receipt_pdf_path?: string | null
          received_by?: string | null
          reference?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      scholarships: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["discount_kind"]
          name: string
          school_id: string
          value: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["discount_kind"]
          name: string
          school_id: string
          value: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["discount_kind"]
          name?: string
          school_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "scholarships_school_id_fkey"
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
      student_fees: {
        Row: {
          academic_year_id: string
          amount_due: number
          created_at: string
          discount_amount: number
          fee_category_id: string
          fee_structure_id: string | null
          id: string
          net_due: number | null
          scholarship_id: string | null
          school_id: string
          status: Database["public"]["Enums"]["fee_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          amount_due: number
          created_at?: string
          discount_amount?: number
          fee_category_id: string
          fee_structure_id?: string | null
          id?: string
          net_due?: number | null
          scholarship_id?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["fee_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          amount_due?: number
          created_at?: string
          discount_amount?: number
          fee_category_id?: string
          fee_structure_id?: string | null
          id?: string
          net_due?: number | null
          scholarship_id?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["fee_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_scholarship_id_fkey"
            columns: ["scholarship_id"]
            isOneToOne: false
            referencedRelation: "scholarships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      study_unit_subjects: {
        Row: {
          class_subject_id: string
          school_id: string
          study_unit_id: string
          weight: number
        }
        Insert: {
          class_subject_id: string
          school_id: string
          study_unit_id: string
          weight?: number
        }
        Update: {
          class_subject_id?: string
          school_id?: string
          study_unit_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_unit_subjects_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_unit_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_unit_subjects_study_unit_id_fkey"
            columns: ["study_unit_id"]
            isOneToOne: false
            referencedRelation: "study_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_unit_subjects_study_unit_id_fkey"
            columns: ["study_unit_id"]
            isOneToOne: false
            referencedRelation: "unit_averages"
            referencedColumns: ["study_unit_id"]
          },
        ]
      }
      study_units: {
        Row: {
          academic_year_id: string
          code: string
          created_at: string
          credits: number
          id: string
          is_compulsory: boolean
          kind: Database["public"]["Enums"]["study_unit_kind"]
          level_id: string | null
          name: string
          program_id: string | null
          school_id: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          code: string
          created_at?: string
          credits: number
          id?: string
          is_compulsory?: boolean
          kind?: Database["public"]["Enums"]["study_unit_kind"]
          level_id?: string | null
          name: string
          program_id?: string | null
          school_id: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          code?: string
          created_at?: string
          credits?: number
          id?: string
          is_compulsory?: boolean
          kind?: Database["public"]["Enums"]["study_unit_kind"]
          level_id?: string | null
          name?: string
          program_id?: string | null
          school_id?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_units_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_units_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_units_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["level_id"]
          },
          {
            foreignKeyName: "study_units_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_units_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "study_units_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_units_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
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
      term_results: {
        Row: {
          absences_count: number
          class_average: number | null
          class_id: string
          class_size: number | null
          computed_at: string
          credits_earned: number | null
          credits_required: number | null
          decision: string | null
          general_average: number | null
          head_comment: string | null
          id: string
          is_published: boolean
          late_count: number
          pdf_path: string | null
          published_at: string | null
          published_by: string | null
          rank: number | null
          school_id: string
          student_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          absences_count?: number
          class_average?: number | null
          class_id: string
          class_size?: number | null
          computed_at?: string
          credits_earned?: number | null
          credits_required?: number | null
          decision?: string | null
          general_average?: number | null
          head_comment?: string | null
          id?: string
          is_published?: boolean
          late_count?: number
          pdf_path?: string | null
          published_at?: string | null
          published_by?: string | null
          rank?: number | null
          school_id: string
          student_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          absences_count?: number
          class_average?: number | null
          class_id?: string
          class_size?: number | null
          computed_at?: string
          credits_earned?: number | null
          credits_required?: number | null
          decision?: string | null
          general_average?: number | null
          head_comment?: string | null
          id?: string
          is_published?: boolean
          late_count?: number
          pdf_path?: string | null
          published_at?: string | null
          published_by?: string | null
          rank?: number | null
          school_id?: string
          student_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "term_results_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_results_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_results_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "term_results_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_results_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      term_subject_results: {
        Row: {
          average: number | null
          class_average: number | null
          class_max: number | null
          class_min: number | null
          class_subject_id: string
          coefficient: number
          computed_at: string
          id: string
          rank: number | null
          school_id: string
          student_id: string
          teacher_comment: string | null
          term_id: string
        }
        Insert: {
          average?: number | null
          class_average?: number | null
          class_max?: number | null
          class_min?: number | null
          class_subject_id: string
          coefficient?: number
          computed_at?: string
          id?: string
          rank?: number | null
          school_id: string
          student_id: string
          teacher_comment?: string | null
          term_id: string
        }
        Update: {
          average?: number | null
          class_average?: number | null
          class_max?: number | null
          class_min?: number | null
          class_subject_id?: string
          coefficient?: number
          computed_at?: string
          id?: string
          rank?: number | null
          school_id?: string
          student_id?: string
          teacher_comment?: string | null
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "term_subject_results_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_subject_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_subject_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_subject_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_subject_results_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      term_unit_results: {
        Row: {
          average: number | null
          computed_at: string
          credits: number
          credits_earned: number
          id: string
          is_validated: boolean
          school_id: string
          student_id: string
          study_unit_id: string
          term_id: string
          validation_mode: Database["public"]["Enums"]["validation_mode"] | null
        }
        Insert: {
          average?: number | null
          computed_at?: string
          credits?: number
          credits_earned?: number
          id?: string
          is_validated?: boolean
          school_id: string
          student_id: string
          study_unit_id: string
          term_id: string
          validation_mode?:
            | Database["public"]["Enums"]["validation_mode"]
            | null
        }
        Update: {
          average?: number | null
          computed_at?: string
          credits?: number
          credits_earned?: number
          id?: string
          is_validated?: boolean
          school_id?: string
          student_id?: string
          study_unit_id?: string
          term_id?: string
          validation_mode?:
            | Database["public"]["Enums"]["validation_mode"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "term_unit_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_unit_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_unit_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_unit_results_study_unit_id_fkey"
            columns: ["study_unit_id"]
            isOneToOne: false
            referencedRelation: "study_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_unit_results_study_unit_id_fkey"
            columns: ["study_unit_id"]
            isOneToOne: false
            referencedRelation: "unit_averages"
            referencedColumns: ["study_unit_id"]
          },
          {
            foreignKeyName: "term_unit_results_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
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
      transcripts: {
        Row: {
          academic_year_id: string
          exam_session_id: string | null
          id: string
          issued_at: string
          issued_by: string | null
          pdf_path: string | null
          school_id: string
          serial_number: string
          student_id: string
        }
        Insert: {
          academic_year_id: string
          exam_session_id?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          pdf_path?: string | null
          school_id: string
          serial_number: string
          student_id: string
        }
        Update: {
          academic_year_id?: string
          exam_session_id?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          pdf_path?: string | null
          school_id?: string
          serial_number?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_session_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      exam_session_overview: {
        Row: {
          academic_year_id: string | null
          admitted_count: number | null
          deliberated_count: number | null
          end_date: string | null
          exam_count: number | null
          id: string | null
          name: string | null
          registered_count: number | null
          school_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["exam_session_status"] | null
          type: Database["public"]["Enums"]["exam_session_type"] | null
        }
        Insert: {
          academic_year_id?: string | null
          admitted_count?: never
          deliberated_count?: never
          end_date?: string | null
          exam_count?: never
          id?: string | null
          name?: string | null
          registered_count?: never
          school_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["exam_session_status"] | null
          type?: Database["public"]["Enums"]["exam_session_type"] | null
        }
        Update: {
          academic_year_id?: string | null
          admitted_count?: never
          deliberated_count?: never
          end_date?: string | null
          exam_count?: never
          id?: string | null
          name?: string | null
          registered_count?: never
          school_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["exam_session_status"] | null
          type?: Database["public"]["Enums"]["exam_session_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_revenue: {
        Row: {
          amount: number | null
          month: string | null
          payment_count: number | null
          school_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_school_id_fkey"
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
      student_balances: {
        Row: {
          academic_year_id: string | null
          balance: number | null
          days_overdue: number | null
          full_name: string | null
          matricule: string | null
          oldest_due_date: string | null
          overdue_invoices: number | null
          school_id: string | null
          student_id: string | null
          total_invoiced: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      subject_averages: {
        Row: {
          average: number | null
          class_id: string | null
          class_subject_id: string | null
          coefficient: number | null
          credits: number | null
          graded_count: number | null
          school_id: string | null
          student_id: string | null
          subject_id: string | null
          term_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      term_averages: {
        Row: {
          class_id: string | null
          general_average: number | null
          rank: number | null
          school_id: string | null
          student_id: string | null
          subject_count: number | null
          term_id: string | null
          total_coefficient: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      unit_averages: {
        Row: {
          average: number | null
          class_id: string | null
          credits: number | null
          school_id: string | null
          student_id: string | null
          study_unit_id: string | null
          term_id: string | null
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
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_units_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_units_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_subject_template: { Args: { p_class_id: string }; Returns: number }
      assign_exam_seats: { Args: { p_exam_id: string }; Returns: number }
      assign_fees_to_student: {
        Args: { p_student_id: string; p_year_id: string }
        Returns: number
      }
      compute_deliberations: { Args: { p_session_id: string }; Returns: number }
      compute_term_results: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: number
      }
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
      issue_invoice: {
        Args: { p_due_date?: string; p_student_id: string; p_year_id: string }
        Returns: string
      }
      next_number: {
        Args: { p_kind: string; p_school: string; p_year?: number }
        Returns: string
      }
      publish_term_results: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: number
      }
      push_exam_to_grades: {
        Args: { p_exam_id: string; p_term_id: string }
        Returns: number
      }
      record_payment: {
        Args: {
          p_amount: number
          p_invoice_id: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_paid_at?: string
          p_reference?: string
        }
        Returns: string
      }
      register_class_for_session: {
        Args: { p_class_id: string; p_session_id: string }
        Returns: number
      }
      timemultirange: { Args: never; Returns: unknown }
    }
    Enums: {
      calendar_event_type: "holiday" | "exam_period" | "closure" | "event"
      discount_kind: "percentage" | "fixed"
      enrollment_status:
        | "active"
        | "transferred"
        | "withdrawn"
        | "repeating"
        | "completed"
      exam_decision: "admitted" | "failed" | "resit" | "deferred" | "excluded"
      exam_session_status:
        | "draft"
        | "scheduled"
        | "ongoing"
        | "graded"
        | "deliberated"
        | "closed"
      exam_session_type: "regular" | "resit" | "entrance" | "final" | "mock"
      fee_status: "pending" | "partial" | "paid" | "waived" | "overdue"
      guardian_relationship:
        | "father"
        | "mother"
        | "stepparent"
        | "grandparent"
        | "sibling"
        | "tutor"
        | "other"
      import_status: "pending" | "processing" | "completed" | "failed"
      invoice_status:
        | "draft"
        | "issued"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "cancelled"
      lesson_status: "planned" | "held" | "cancelled" | "replaced"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "mobile_money"
        | "card"
        | "check"
        | "other"
      payment_status: "confirmed" | "pending" | "cancelled"
      registration_status: "registered" | "absent" | "excluded"
      reminder_channel: "email" | "sms" | "in_app"
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
      study_unit_kind:
        | "fundamental"
        | "methodology"
        | "discovery"
        | "transversal"
        | "other"
      supervisor_role: "invigilator" | "chief" | "floater"
      term_kind: "trimester" | "semester" | "quarter" | "year"
      user_role:
        | "super_admin"
        | "school_admin"
        | "teacher"
        | "student"
        | "parent"
        | "accountant"
      validation_mode: "direct" | "compensation" | "resit"
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
      discount_kind: ["percentage", "fixed"],
      enrollment_status: [
        "active",
        "transferred",
        "withdrawn",
        "repeating",
        "completed",
      ],
      exam_decision: ["admitted", "failed", "resit", "deferred", "excluded"],
      exam_session_status: [
        "draft",
        "scheduled",
        "ongoing",
        "graded",
        "deliberated",
        "closed",
      ],
      exam_session_type: ["regular", "resit", "entrance", "final", "mock"],
      fee_status: ["pending", "partial", "paid", "waived", "overdue"],
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
      invoice_status: [
        "draft",
        "issued",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
      ],
      lesson_status: ["planned", "held", "cancelled", "replaced"],
      payment_method: [
        "cash",
        "bank_transfer",
        "mobile_money",
        "card",
        "check",
        "other",
      ],
      payment_status: ["confirmed", "pending", "cancelled"],
      registration_status: ["registered", "absent", "excluded"],
      reminder_channel: ["email", "sms", "in_app"],
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
      study_unit_kind: [
        "fundamental",
        "methodology",
        "discovery",
        "transversal",
        "other",
      ],
      supervisor_role: ["invigilator", "chief", "floater"],
      term_kind: ["trimester", "semester", "quarter", "year"],
      user_role: [
        "super_admin",
        "school_admin",
        "teacher",
        "student",
        "parent",
        "accountant",
      ],
      validation_mode: ["direct", "compensation", "resit"],
    },
  },
} as const

