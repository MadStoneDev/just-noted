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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      authors: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          last_active_at: string | null
          redis_user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          last_active_at?: string | null
          redis_user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          last_active_at?: string | null
          redis_user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      collections: {
        Row: {
          created_at: string
          id: string
          name: string | null
          owner: string | null
          shortcode: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          owner?: string | null
          shortcode?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          owner?: string | null
          shortcode?: string | null
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
          collection_id: string
          id: number
          note_id: string | null
        }
        Insert: {
          collection_id?: string
          id?: number
          note_id?: string | null
        }
        Update: {
          collection_id?: string
          id?: number
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
          cover_type: string
          cover_value: string
          created_at: string
          display_order: number
          id: string
          name: string
          owner: string
          updated_at: string
        }
        Insert: {
          cover_type?: string
          cover_value?: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          owner: string
          updated_at?: string
        }
        Update: {
          cover_type?: string
          cover_value?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          owner?: string
          updated_at?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          author: string | null
          content: string | null
          created_at: string
          goal: number | null
          goal_type: string | null
          id: string
          is_collapsed: boolean | null
          is_pinned: boolean | null
          is_private: boolean | null
          notebook_id: string | null
          order: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          content?: string | null
          created_at?: string
          goal?: number | null
          goal_type?: string | null
          id?: string
          is_collapsed?: boolean | null
          is_pinned?: boolean | null
          is_private?: boolean | null
          notebook_id?: string | null
          order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          content?: string | null
          created_at?: string
          goal?: number | null
          goal_type?: string | null
          id?: string
          is_collapsed?: boolean | null
          is_pinned?: boolean | null
          is_private?: boolean | null
          notebook_id?: string | null
          order?: number | null
          title?: string | null
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
          created_at: string | null
          expires_at: string | null
          id: string
          is_public: boolean | null
          note_id: string
          note_owner_id: string
          note_owner_id_old: string | null
          shortcode: string
          storage: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          note_id: string
          note_owner_id: string
          note_owner_id_old?: string | null
          shortcode: string
          storage?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          note_id?: string
          note_owner_id?: string
          note_owner_id_old?: string | null
          shortcode?: string
          storage?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      shared_notes_analytics: {
        Row: {
          analytics: Json | null
          created_at: string | null
          id: string
          shared_note: string
        }
        Insert: {
          analytics?: Json | null
          created_at?: string | null
          id?: string
          shared_note: string
        }
        Update: {
          analytics?: Json | null
          created_at?: string | null
          id?: string
          shared_note?: string
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
          created_at: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          reader_id: string | null
          reader_username: string
          shared_note: string
          view_count: number | null
        }
        Insert: {
          created_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          reader_id?: string | null
          reader_username: string
          shared_note: string
          view_count?: number | null
        }
        Update: {
          created_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          reader_id?: string | null
          reader_username?: string
          shared_note?: string
          view_count?: number | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_author_with_random_username: {
        Args: { user_id: string }
        Returns: Json
      }
      generate_random_username: { Args: never; Returns: string }
      increment_view_count: {
        Args: { shortcode_param: string }
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
