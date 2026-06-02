export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12.2.12"
  }
  public: {
    Tables: {
      authors: {
        Row: {
          id: string
          username: string | null
          avatar_url: string | null
          created_at: string
          last_active_at: string | null
          redis_user_id: string | null
        }
        Insert: {
          id?: string
          username?: string | null
          avatar_url?: string | null
          created_at?: string
          last_active_at?: string | null
          redis_user_id?: string | null
        }
        Update: {
          id?: string
          username?: string | null
          avatar_url?: string | null
          created_at?: string
          last_active_at?: string | null
          redis_user_id?: string | null
        }
        Relationships: []
      }
      collections: {
        Row: {
          id: string
          owner: string | null
          name: string | null
          shortcode: string | null
          created_at: string
        }
        Insert: {
          id?: string
          owner?: string | null
          name?: string | null
          shortcode?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          owner?: string | null
          name?: string | null
          shortcode?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
        ]
      }
      collections_notes: {
        Row: {
          id: number
          collection_id: string
          note_id: string | null
        }
        Insert: {
          id?: number
          collection_id?: string
          note_id?: string | null
        }
        Update: {
          id?: number
          collection_id?: string
          note_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_notes_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_notes_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notebooks: {
        Row: {
          id: string
          owner: string
          name: string
          cover_type: string
          cover_value: string
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner: string
          name: string
          cover_type?: string
          cover_value?: string
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner?: string
          name?: string
          cover_type?: string
          cover_value?: string
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          id: string
          author: string | null
          title: string | null
          content: string | null
          is_pinned: boolean | null
          is_private: boolean | null
          is_collapsed: boolean | null
          order: number | null
          goal: number | null
          goal_type: string | null
          notebook_id: string | null
          content_format: string | null
          content_html_backup: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          author?: string | null
          title?: string | null
          content?: string | null
          is_pinned?: boolean | null
          is_private?: boolean | null
          is_collapsed?: boolean | null
          order?: number | null
          goal?: number | null
          goal_type?: string | null
          notebook_id?: string | null
          content_format?: string | null
          content_html_backup?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          author?: string | null
          title?: string | null
          content?: string | null
          is_pinned?: boolean | null
          is_private?: boolean | null
          is_collapsed?: boolean | null
          order?: number | null
          goal?: number | null
          goal_type?: string | null
          notebook_id?: string | null
          content_format?: string | null
          content_html_backup?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_notes: {
        Row: {
          id: string
          note_id: string
          note_owner_id: string
          note_owner_id_old: string | null
          shortcode: string
          is_public: boolean | null
          is_anonymous: boolean | null
          password_hash: string | null
          storage: string | null
          view_count: number | null
          expires_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          note_id: string
          note_owner_id: string
          note_owner_id_old?: string | null
          shortcode: string
          is_public?: boolean | null
          is_anonymous?: boolean | null
          password_hash?: string | null
          storage?: string | null
          view_count?: number | null
          expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          note_id?: string
          note_owner_id?: string
          note_owner_id_old?: string | null
          shortcode?: string
          is_public?: boolean | null
          is_anonymous?: boolean | null
          password_hash?: string | null
          storage?: string | null
          view_count?: number | null
          expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      shared_notes_analytics: {
        Row: {
          id: string
          shared_note: string
          analytics: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          shared_note: string
          analytics?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          shared_note?: string
          analytics?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_notes_analytics_shared_note_fkey"
            columns: ["shared_note"]
            isOneToOne: false
            referencedRelation: "shared_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_notes_readers: {
        Row: {
          id: string
          shared_note: string
          reader_username: string
          reader_id: string | null
          view_count: number | null
          first_viewed_at: string | null
          last_viewed_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          shared_note: string
          reader_username: string
          reader_id?: string | null
          view_count?: number | null
          first_viewed_at?: string | null
          last_viewed_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          shared_note?: string
          reader_username?: string
          reader_id?: string | null
          view_count?: number | null
          first_viewed_at?: string | null
          last_viewed_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_notes_readers_shared_note_fkey"
            columns: ["shared_note"]
            isOneToOne: false
            referencedRelation: "shared_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          tier: string
          status: string
          paddle_subscription_id: string | null
          paddle_customer_id: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          tier?: string
          status?: string
          paddle_subscription_id?: string | null
          paddle_customer_id?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          tier?: string
          status?: string
          paddle_subscription_id?: string | null
          paddle_customer_id?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
    }
    Functions: {
      create_author_with_random_username: {
        Args: {
          user_id: string
        }
        Returns: Json
      }
      generate_random_username: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      increment_view_count: {
        Args: {
          shortcode_param: string
        }
        Returns: number
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
