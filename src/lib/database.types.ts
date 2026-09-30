/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by `npm run types:gen`, which runs
 * `supabase gen types typescript --local` against the migrations in
 * `supabase/migrations`. Change the schema there, then regenerate.
 *
 * Note that every view column is typed nullable: PostgreSQL does not record
 * NOT NULL on views. `src/lib/domain.ts` re-narrows those rows into the shapes
 * the UI actually consumes, and is where the null handling lives.
 */


export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "attempt_answers": {
                  Row: {
                    "attempt_id": string,"id": string,"is_correct": boolean,"option_id": string | null,"question_id": string,"time_ms": number
                  }
                  Insert: {
                    "attempt_id": string,"id"?: string,"is_correct"?: boolean,"option_id"?: string | null,"question_id": string,"time_ms"?: number
                  }
                  Update: {
                    "attempt_id"?: string,"id"?: string,"is_correct"?: boolean,"option_id"?: string | null,"question_id"?: string,"time_ms"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempt_answers_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempt_answers_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "leaderboard_entries"
      referencedColumns: ["attempt_id"]
    },{
      foreignKeyName: "attempt_answers_option_id_fkey"
      columns: ["option_id"]
isOneToOne: false
      referencedRelation: "options"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempt_answers_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"attempts": {
                  Row: {
                    "accuracy": number,"completed_at": string,"correct_count": number,"duration_seconds": number,"guest_name": string | null,"id": string,"max_score": number,"question_count": number,"quiz_id": string,"score": number,"user_id": string | null
                  }
                  Insert: {
                    "accuracy"?: number,"completed_at"?: string,"correct_count"?: number,"duration_seconds"?: number,"guest_name"?: string | null,"id"?: string,"max_score"?: number,"question_count"?: number,"quiz_id": string,"score"?: number,"user_id"?: string | null
                  }
                  Update: {
                    "accuracy"?: number,"completed_at"?: string,"correct_count"?: number,"duration_seconds"?: number,"guest_name"?: string | null,"id"?: string,"max_score"?: number,"question_count"?: number,"quiz_id"?: string,"score"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempts_quiz_id_fkey"
      columns: ["quiz_id"]
isOneToOne: false
      referencedRelation: "quiz_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_quiz_id_fkey"
      columns: ["quiz_id"]
isOneToOne: false
      referencedRelation: "quizzes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"options": {
                  Row: {
                    "id": string,"is_correct": boolean,"label": string,"position": number,"question_id": string
                  }
                  Insert: {
                    "id"?: string,"is_correct"?: boolean,"label": string,"position"?: number,"question_id": string
                  }
                  Update: {
                    "id"?: string,"is_correct"?: boolean,"label"?: string,"position"?: number,"question_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "options_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_emoji": string,"bio": string | null,"created_at": string,"display_name": string,"id": string,"is_guest": boolean,"role": string,"school": string | null,"updated_at": string,"username": string
                  }
                  Insert: {
                    "avatar_emoji"?: string,"bio"?: string | null,"created_at"?: string,"display_name": string,"id": string,"is_guest"?: boolean,"role"?: string,"school"?: string | null,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "avatar_emoji"?: string,"bio"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"is_guest"?: boolean,"role"?: string,"school"?: string | null,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"questions": {
                  Row: {
                    "created_at": string,"explanation": string | null,"id": string,"image_url": string | null,"points": number,"position": number,"prompt": string,"quiz_id": string,"time_limit_seconds": number | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"explanation"?: string | null,"id"?: string,"image_url"?: string | null,"points"?: number,"position"?: number,"prompt": string,"quiz_id": string,"time_limit_seconds"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"explanation"?: string | null,"id"?: string,"image_url"?: string | null,"points"?: number,"position"?: number,"prompt"?: string,"quiz_id"?: string,"time_limit_seconds"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_quiz_id_fkey"
      columns: ["quiz_id"]
isOneToOne: false
      referencedRelation: "quiz_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_quiz_id_fkey"
      columns: ["quiz_id"]
isOneToOne: false
      referencedRelation: "quizzes"
      referencedColumns: ["id"]
    }
                  ]
                },"quizzes": {
                  Row: {
                    "ai_generated": boolean,"cover_emoji": string,"created_at": string,"description": string | null,"difficulty": string,"id": string,"owner_id": string,"play_count": number,"published_at": string | null,"shuffle_options": boolean,"shuffle_questions": boolean,"slug": string,"status": string,"time_limit_seconds": number,"title": string,"topic_id": string | null,"updated_at": string,"visibility": string
                  }
                  Insert: {
                    "ai_generated"?: boolean,"cover_emoji"?: string,"created_at"?: string,"description"?: string | null,"difficulty"?: string,"id"?: string,"owner_id": string,"play_count"?: number,"published_at"?: string | null,"shuffle_options"?: boolean,"shuffle_questions"?: boolean,"slug": string,"status"?: string,"time_limit_seconds"?: number,"title": string,"topic_id"?: string | null,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "ai_generated"?: boolean,"cover_emoji"?: string,"created_at"?: string,"description"?: string | null,"difficulty"?: string,"id"?: string,"owner_id"?: string,"play_count"?: number,"published_at"?: string | null,"shuffle_options"?: boolean,"shuffle_questions"?: boolean,"slug"?: string,"status"?: string,"time_limit_seconds"?: number,"title"?: string,"topic_id"?: string | null,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quizzes_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quizzes_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"topics": {
                  Row: {
                    "accent": string,"created_at": string,"description": string | null,"emoji": string,"id": string,"is_active": boolean,"name": string,"slug": string,"sort_order": number
                  }
                  Insert: {
                    "accent"?: string,"created_at"?: string,"description"?: string | null,"emoji"?: string,"id"?: string,"is_active"?: boolean,"name": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "accent"?: string,"created_at"?: string,"description"?: string | null,"emoji"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "global_leaderboard": {
                  Row: {
                    "attempt_count": number | null,"avatar_emoji": string | null,"avg_accuracy": number | null,"best_score": number | null,"display_name": string | null,"is_guest": boolean | null,"last_played_at": string | null,"quiz_count": number | null,"total_score": number | null,"user_id": string | null,"username": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"leaderboard_entries": {
                  Row: {
                    "accuracy": number | null,"attempt_id": string | null,"avatar_emoji": string | null,"completed_at": string | null,"correct_count": number | null,"cover_emoji": string | null,"display_name": string | null,"duration_seconds": number | null,"is_guest": boolean | null,"max_score": number | null,"question_count": number | null,"quiz_id": string | null,"quiz_slug": string | null,"quiz_title": string | null,"score": number | null,"topic_id": string | null,"topic_name": string | null,"topic_slug": string | null,"user_id": string | null,"username": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempts_quiz_id_fkey"
      columns: ["quiz_id"]
isOneToOne: false
      referencedRelation: "quiz_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_quiz_id_fkey"
      columns: ["quiz_id"]
isOneToOne: false
      referencedRelation: "quizzes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quizzes_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_cards": {
                  Row: {
                    "ai_generated": boolean | null,"attempt_count": number | null,"author_avatar": string | null,"author_name": string | null,"author_username": string | null,"cover_emoji": string | null,"created_at": string | null,"description": string | null,"difficulty": string | null,"id": string | null,"max_score": number | null,"owner_id": string | null,"play_count": number | null,"published_at": string | null,"question_count": number | null,"slug": string | null,"status": string | null,"time_limit_seconds": number | null,"title": string | null,"topic_accent": string | null,"topic_emoji": string | null,"topic_id": string | null,"topic_name": string | null,"topic_slug": string | null,"updated_at": string | null,"visibility": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quizzes_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quizzes_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "attempt_compute_accuracy":
{ Args: { "p_max": number,"p_score": number }; Returns: number
                           },
"can_view_quiz":
{ Args: { "p_quiz_id": string }; Returns: boolean
                           },
"get_quiz_for_play":
{ Args: { "p_slug": string }; Returns: Json
                           },
"is_admin":
{ Args: { "p_uid"?: string }; Returns: boolean
                           },
"is_teacher":
{ Args: { "p_uid"?: string }; Returns: boolean
                           },
"owns_question":
{ Args: { "p_question_id": string }; Returns: boolean
                           },
"owns_quiz":
{ Args: { "p_quiz_id": string }; Returns: boolean
                           },
"quiz_stats":
{ Args: { "p_quiz_id": string }; Returns: {
              "max_score": number,"question_count": number
            }[]
                           },
"save_quiz":
{ Args: { "p_payload": Json }; Returns: Json
                           },
"slugify":
{ Args: { "p_input": string }; Returns: string
                           },
"submit_attempt":
{ Args: { "p_answers": Json,"p_duration_seconds"?: number,"p_guest_name"?: string,"p_slug": string }; Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

