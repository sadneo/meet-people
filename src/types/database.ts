export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      conversation_participants: {
        Row: {
          conversation_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          participant_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_key: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_key?: string
        }
        Relationships: []
      }
      event_group_members: {
        Row: {
          event_id: string
          group_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          group_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          group_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_group_members_event_id_user_id_fkey"
            columns: ["event_id", "user_id"]
            isOneToOne: true
            referencedRelation: "event_interests"
            referencedColumns: ["event_id", "user_id"]
          },
          {
            foreignKeyName: "event_group_members_group_id_event_id_fkey"
            columns: ["group_id", "event_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      event_groups: {
        Row: {
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      event_interests: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_interests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "event_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_profiles: {
        Row: {
          display_name: string
          user_id: string
        }
        Insert: {
          display_name: string
          user_id: string
        }
        Update: {
          display_name?: string
          user_id?: string
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          accepted_count: number
          created_at: string
          deleted_count: number
          error_summary: Json
          fetched_count: number
          finished_at: string | null
          id: string
          inactivated_count: number
          missed_count: number
          mode: string
          request_count: number
          reset_count: number
          skipped_count: number
          source: string
          started_at: string
          status: string
          updated_at: string
          upserted_count: number
          window_ends_at: string | null
          window_starts_at: string | null
        }
        Insert: {
          accepted_count?: number
          created_at?: string
          deleted_count?: number
          error_summary?: Json
          fetched_count?: number
          finished_at?: string | null
          id?: string
          inactivated_count?: number
          missed_count?: number
          mode: string
          request_count?: number
          reset_count?: number
          skipped_count?: number
          source: string
          started_at?: string
          status?: string
          updated_at?: string
          upserted_count?: number
          window_ends_at?: string | null
          window_starts_at?: string | null
        }
        Update: {
          accepted_count?: number
          created_at?: string
          deleted_count?: number
          error_summary?: Json
          fetched_count?: number
          finished_at?: string | null
          id?: string
          inactivated_count?: number
          missed_count?: number
          mode?: string
          request_count?: number
          reset_count?: number
          skipped_count?: number
          source?: string
          started_at?: string
          status?: string
          updated_at?: string
          upserted_count?: number
          window_ends_at?: string | null
          window_starts_at?: string | null
        }
        Relationships: []
      }
      listings: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          created_at: string
          description: string | null
          details_synced_at: string | null
          ends_at: string | null
          external_id: string
          id: string
          image_url: string | null
          last_synced_at: string | null
          latitude: number | null
          listing_type: string
          location_name: string | null
          longitude: number | null
          missed_sync_count: number
          postal_code: string | null
          region: string | null
          source: string
          source_url: string | null
          starts_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          details_synced_at?: string | null
          ends_at?: string | null
          external_id: string
          id?: string
          image_url?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          listing_type?: string
          location_name?: string | null
          longitude?: number | null
          missed_sync_count?: number
          postal_code?: string | null
          region?: string | null
          source: string
          source_url?: string | null
          starts_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          details_synced_at?: string | null
          ends_at?: string | null
          external_id?: string
          id?: string
          image_url?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          listing_type?: string
          location_name?: string | null
          longitude?: number | null
          missed_sync_count?: number
          postal_code?: string | null
          region?: string | null
          source?: string
          source_url?: string | null
          starts_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          client_request_id: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          client_request_id: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          client_request_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_sender_id_fkey"
            columns: ["conversation_id", "sender_id"]
            isOneToOne: false
            referencedRelation: "conversation_participants"
            referencedColumns: ["conversation_id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      event_categories: { Args: never; Returns: Json }
      event_company_action: {
        Args: {
          p_action: string
          p_event_id: string
          p_name: string
          p_user_id: string
        }
        Returns: undefined
      }
      event_company_snapshot: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: Json
      }
      event_interest_counts: { Args: { p_event_ids: string[] }; Returns: Json }
      messaging_check_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      messaging_ensure_conversation: {
        Args: { p_participant_ids: string[] }
        Returns: string
      }
      messaging_ensure_event_conversation: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: string
      }
      messaging_history: {
        Args: {
          p_before?: string
          p_conversation_id: string
          p_user_id: string
        }
        Returns: Json
      }
      messaging_list_conversations: {
        Args: { p_page?: number; p_user_id: string }
        Returns: Json
      }
      messaging_send: {
        Args: {
          p_body: string
          p_conversation_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      reconcile_sbengaged_full_sync: {
        Args: {
          p_seen_external_ids: string[]
          p_window_ends_at: string
          p_window_starts_at: string
        }
        Returns: {
          inactivated_count: number
          missed_count: number
          reset_count: number
        }[]
      }
      reconcile_ticketmaster_full_sync: {
        Args: {
          p_seen_external_ids: string[]
          p_window_ends_at: string
          p_window_starts_at: string
        }
        Returns: {
          inactivated_count: number
          missed_count: number
          reset_count: number
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

