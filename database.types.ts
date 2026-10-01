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
      account_deletions: {
        Row: {
          user_id: string
          requested_at: string
          purge_at: string
          stripe_canceled: boolean
          status: string
        }
        Insert: {
          user_id: string
          requested_at?: string
          purge_at: string
          stripe_canceled?: boolean
          status?: string
        }
        Update: {
          user_id?: string
          requested_at?: string
          purge_at?: string
          stripe_canceled?: boolean
          status?: string
        }
        Relationships: []
      }
      account_exports: {
        Row: {
          id: string
          user_id: string
          status: string
          storage_key: string | null
          size_bytes: number | null
          error: string | null
          created_at: string
          expires_at: string | null
          format: string
          anon_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          status?: string
          storage_key?: string | null
          size_bytes?: number | null
          error?: string | null
          created_at?: string
          expires_at?: string | null
          format?: string
          anon_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          status?: string
          storage_key?: string | null
          size_bytes?: number | null
          error?: string | null
          created_at?: string
          expires_at?: string | null
          format?: string
          anon_id?: string | null
        }
        Relationships: []
      }
      authors: {
        Row: {
          id: string
          username: string | null
          avatar_url: string | null
          created_at: string
          last_active_at: string | null
          redis_user_id: string | null
          role: number
        }
        Insert: {
          id?: string
          username?: string | null
          avatar_url?: string | null
          created_at?: string
          last_active_at?: string | null
          redis_user_id?: string | null
          role?: number
        }
        Update: {
          id?: string
          username?: string | null
          avatar_url?: string | null
          created_at?: string
          last_active_at?: string | null
          redis_user_id?: string | null
          role?: number
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
      note_chat_message_versions: {
        Row: {
          id: string
          message_id: string
          body: string | null
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          body?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          body?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_chat_message_versions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "note_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      note_chat_messages: {
        Row: {
          id: string
          note_id: string
          author_id: string | null
          kind: string
          body: string | null
          reply_to: string | null
          anchor: Json | null
          media_key: string | null
          media_mime: string | null
          media_meta: Json | null
          created_at: string
          edited_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          note_id: string
          author_id?: string | null
          kind?: string
          body?: string | null
          reply_to?: string | null
          anchor?: Json | null
          media_key?: string | null
          media_mime?: string | null
          media_meta?: Json | null
          created_at?: string
          edited_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          note_id?: string
          author_id?: string | null
          kind?: string
          body?: string | null
          reply_to?: string | null
          anchor?: Json | null
          media_key?: string | null
          media_mime?: string | null
          media_meta?: Json | null
          created_at?: string
          edited_at?: string | null
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_chat_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_chat_messages_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_chat_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "note_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      note_chat_reads: {
        Row: {
          note_id: string
          user_id: string
          last_read_at: string
        }
        Insert: {
          note_id: string
          user_id: string
          last_read_at?: string
        }
        Update: {
          note_id?: string
          user_id?: string
          last_read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_chat_reads_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_tags: {
        Row: {
          note_id: string
          tag_id: string
        }
        Insert: {
          note_id: string
          tag_id: string
        }
        Update: {
          note_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_tags_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      note_versions: {
        Row: {
          id: string
          note_id: string
          author: string
          title: string | null
          content: string | null
          content_format: string | null
          created_at: string
          reason: string
          note_version: number | null
        }
        Insert: {
          id?: string
          note_id: string
          author: string
          title?: string | null
          content?: string | null
          content_format?: string | null
          created_at?: string
          reason?: string
          note_version?: number | null
        }
        Update: {
          id?: string
          note_id?: string
          author?: string
          title?: string | null
          content?: string | null
          content_format?: string | null
          created_at?: string
          reason?: string
          note_version?: number | null
        }
        Relationships: []
      }
      note_ydoc: {
        Row: {
          note_id: string
          state: string
          updated_at: string
        }
        Insert: {
          note_id: string
          state: string
          updated_at?: string
        }
        Update: {
          note_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_ydoc_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: true
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
          word_goal: number | null
          parent_id: string | null
          is_hidden: boolean
          show_hidden_children: boolean
          colour: string
          cover: Json
          description: string | null
          goal: Json | null
          is_private: boolean
          is_published: boolean
          sort_index: number
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
          word_goal?: number | null
          parent_id?: string | null
          is_hidden?: boolean
          show_hidden_children?: boolean
          colour?: string
          cover?: Json
          description?: string | null
          goal?: Json | null
          is_private?: boolean
          is_published?: boolean
          sort_index?: number
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
          word_goal?: number | null
          parent_id?: string | null
          is_hidden?: boolean
          show_hidden_children?: boolean
          colour?: string
          cover?: Json
          description?: string | null
          goal?: Json | null
          is_private?: boolean
          is_published?: boolean
          sort_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "notebooks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
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
          deleted_at: string | null
          version: number
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
          deleted_at?: string | null
          version?: number
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
          deleted_at?: string | null
          version?: number
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
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          actor_id: string | null
          note_id: string | null
          data: Json | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          actor_id?: string | null
          note_id?: string | null
          data?: Json | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          actor_id?: string | null
          note_id?: string | null
          data?: Json | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_items: {
        Row: {
          id: string
          title: string
          body: string
          status: string
          source: string
          is_public: boolean
          vote_count: number
          created_by: string | null
          sort_order: number
          created_at: string
          updated_at: string
          category: string | null
        }
        Insert: {
          id?: string
          title: string
          body?: string
          status?: string
          source?: string
          is_public?: boolean
          vote_count?: number
          created_by?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          category?: string | null
        }
        Update: {
          id?: string
          title?: string
          body?: string
          status?: string
          source?: string
          is_public?: boolean
          vote_count?: number
          created_by?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          category?: string | null
        }
        Relationships: []
      }
      roadmap_votes: {
        Row: {
          id: string
          item_id: string
          user_id: string | null
          voter_key: string | null
          ip: string | null
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          user_id?: string | null
          voter_key?: string | null
          ip?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          user_id?: string | null
          voter_key?: string | null
          ip?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_votes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "roadmap_items"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_shared_notes: {
        Row: {
          id: string
          user_id: string
          shortcode: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          shortcode: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          shortcode?: string
          created_at?: string
        }
        Relationships: []
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
          link_permission: string
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
          link_permission?: string
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
          link_permission?: string
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
          role: string
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
          role?: string
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
          role?: string
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
          current_period_end: string | null
          cancel_at_period_end: boolean | null
          created_at: string | null
          updated_at: string | null
          trash_retention_days: number
          plan_source: string
          comp_until: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          tier?: string
          status?: string
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          trash_retention_days?: number
          plan_source?: string
          comp_until?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          tier?: string
          status?: string
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          trash_retention_days?: number
          plan_source?: string
          comp_until?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          owner: string
          name: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          owner: string
          name: string
          color?: string
          created_at?: string
        }
        Update: {
          id?: string
          owner?: string
          name?: string
          color?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          user_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          user_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          user_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      writing_sessions: {
        Row: {
          id: string
          user_id: string
          date: string
          words_written: number
          duration_seconds: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date?: string
          words_written?: number
          duration_seconds?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          words_written?: number
          duration_seconds?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "writing_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
    }
    Functions: {
      author_id_by_email: {
        Args: {
          p_email: string
        }
        Returns: string
      }
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
      is_note_chat_participant: {
        Args: {
          p_note_id: string
        }
        Returns: boolean
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
