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
      availability: {
        Row: {
          created_at: string | null
          dow: number
          end_time: string
          id: number
          profile_id: string | null
          start_time: string
        }
        Insert: {
          created_at?: string | null
          dow: number
          end_time: string
          id?: never
          profile_id?: string | null
          start_time: string
        }
        Update: {
          created_at?: string | null
          dow?: number
          end_time?: string
          id?: never
          profile_id?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          created_at: string | null
          id: number
          initiated_by: string
          responded_at: string | null
          status: string
          user_a: string | null
          user_b: string | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          initiated_by: string
          responded_at?: string | null
          status?: string
          user_a?: string | null
          user_b?: string | null
        }
        Update: {
          created_at?: string | null
          id?: never
          initiated_by?: string
          responded_at?: string | null
          status?: string
          user_a?: string | null
          user_b?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connections_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: number
          user_a: string | null
          user_b: string | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          user_a?: string | null
          user_b?: string | null
        }
        Update: {
          created_at?: string | null
          id?: never
          user_a?: string | null
          user_b?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_requests: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          path: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          path?: string
          user_id?: string
        }
        Relationships: []
      }
      dating_matches: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: number
          initiated_by: string
          responded_at: string | null
          status: string
          user_a: string | null
          user_b: string | null
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: never
          initiated_by: string
          responded_at?: string | null
          status?: string
          user_a?: string | null
          user_b?: string | null
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: never
          initiated_by?: string
          responded_at?: string | null
          status?: string
          user_a?: string | null
          user_b?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dating_matches_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dating_matches_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dating_matches_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      event_interest: {
        Row: {
          created_at: string | null
          meetup_id: number
          note: string | null
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          meetup_id: number
          note?: string | null
          profile_id: string
        }
        Update: {
          created_at?: string | null
          meetup_id?: number
          note?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_interest_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_interest_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      interaction_outcomes: {
        Row: {
          became_dating: boolean | null
          became_friends: boolean | null
          context: string
          created_at: string | null
          id: number
          met: boolean | null
          rating: number | null
          updated_at: string | null
          user_a: string | null
          user_b: string | null
        }
        Insert: {
          became_dating?: boolean | null
          became_friends?: boolean | null
          context: string
          created_at?: string | null
          id?: never
          met?: boolean | null
          rating?: number | null
          updated_at?: string | null
          user_a?: string | null
          user_b?: string | null
        }
        Update: {
          became_dating?: boolean | null
          became_friends?: boolean | null
          context?: string
          created_at?: string | null
          id?: never
          met?: boolean | null
          rating?: number | null
          updated_at?: string | null
          user_a?: string | null
          user_b?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interaction_outcomes_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_outcomes_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      meetup_attendees: {
        Row: {
          joined_at: string | null
          meetup_id: number
          profile_id: string
          status: string | null
        }
        Insert: {
          joined_at?: string | null
          meetup_id: number
          profile_id: string
          status?: string | null
        }
        Update: {
          joined_at?: string | null
          meetup_id?: number
          profile_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetup_attendees_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetups: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          ends_at: string | null
          host_id: string | null
          id: number
          is_public: boolean | null
          latitude: number | null
          location_name: string | null
          longitude: number | null
          max_attendees: number | null
          starts_at: string
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          host_id?: string | null
          id?: never
          is_public?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          max_attendees?: number | null
          starts_at: string
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          host_id?: string | null
          id?: never
          is_public?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          max_attendees?: number | null
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetups_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: number | null
          created_at: string | null
          id: number
          read_at: string | null
          sender_id: string | null
        }
        Insert: {
          body: string
          conversation_id?: number | null
          created_at?: string | null
          id?: never
          read_at?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: number | null
          created_at?: string | null
          id?: never
          read_at?: string | null
          sender_id?: string | null
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
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          created_at: string | null
          display_name: string
          group_preference: string
          id: string
          intents: string[]
          is_active: boolean | null
          last_seen_at: string | null
          latitude: number | null
          location_city: string | null
          longitude: number | null
          max_distance_miles: number
          onboarded_at: string | null
          pronouns: string | null
          updated_at: string | null
          username: string
          username_changed_at: string | null
          usual_times: string[]
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string | null
          display_name: string
          group_preference?: string
          id: string
          intents?: string[]
          is_active?: boolean | null
          last_seen_at?: string | null
          latitude?: number | null
          location_city?: string | null
          longitude?: number | null
          max_distance_miles?: number
          onboarded_at?: string | null
          pronouns?: string | null
          updated_at?: string | null
          username: string
          username_changed_at?: string | null
          usual_times?: string[]
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string | null
          display_name?: string
          group_preference?: string
          id?: string
          intents?: string[]
          is_active?: boolean | null
          last_seen_at?: string | null
          latitude?: number | null
          location_city?: string | null
          longitude?: number | null
          max_distance_miles?: number
          onboarded_at?: string | null
          pronouns?: string | null
          updated_at?: string | null
          username?: string
          username_changed_at?: string | null
          usual_times?: string[]
        }
        Relationships: []
      }
      queue_entries: {
        Row: {
          joined_at: string | null
          profile_id: string
          queue_type: string
        }
        Insert: {
          joined_at?: string | null
          profile_id: string
          queue_type: string
        }
        Update: {
          joined_at?: string | null
          profile_id?: string
          queue_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_interests: {
        Row: {
          created_at: string | null
          embedding: number[] | null
          id: number
          profile_id: string | null
          text: string
        }
        Insert: {
          created_at?: string | null
          embedding?: number[] | null
          id?: never
          profile_id?: string | null
          text: string
        }
        Update: {
          created_at?: string | null
          embedding?: number[] | null
          id?: never
          profile_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          created_at: string
          details: string | null
          id: number
          reason: string
          reported_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: never
          reason: string
          reported_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: never
          reason?: string
          reported_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          dating_enabled: boolean
          discoverable: boolean
          downtime_matching: boolean
          locale: string | null
          nearby_suggestions: boolean
          notifications: boolean
          profile_id: string
          share_availability: boolean
          timezone: string | null
          updated_at: string
        }
        Insert: {
          dating_enabled?: boolean
          discoverable?: boolean
          downtime_matching?: boolean
          locale?: string | null
          nearby_suggestions?: boolean
          notifications?: boolean
          profile_id: string
          share_availability?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          dating_enabled?: boolean
          discoverable?: boolean
          downtime_matching?: boolean
          locale?: string | null
          nearby_suggestions?: boolean
          notifications?: boolean
          profile_id?: string
          share_availability?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_dating_match: { Args: { match_id: number }; Returns: undefined }
      availability_overlap_minutes: {
        Args: { a: string; b: string }
        Returns: number
      }
      block_user: {
        Args: { p_blocked_id: string; p_blocker_id: string }
        Returns: boolean
      }
      blocked_users: { Args: { p_user_id: string }; Returns: Json }
      can_connect: { Args: { user1: string; user2: string }; Returns: boolean }
      collaborative_fit: { Args: { me: string; them: string }; Returns: number }
      connection_requests_today: { Args: never; Returns: number }
      end_dating_match: { Args: { match_id: number }; Returns: undefined }
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
      export_user_data: { Args: { p_user_id: string }; Returns: Json }
      express_event_interest: {
        Args: { meetup_id_in: number; note_in?: string }
        Returns: undefined
      }
      get_dating_match: {
        Args: never
        Returns: {
          match_avatar_url: string
          match_bio: string
          match_display_name: string
          match_profile_id: string
          match_score: number
          match_username: string
          shared_interests: string[]
          suggested_dow: number
          suggested_end: string
          suggested_lat: number
          suggested_lng: number
          suggested_place: string
          suggested_start: string
        }[]
      }
      get_event_matches: {
        Args: { meetup_id_in: number }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          match_score: number
          note: string
          profile_id: string
          shared_interests: string[]
          username: string
        }[]
      }
      get_events_with_interest: {
        Args: {
          filter_category?: string
          filter_city?: string
          max_results?: number
        }
        Returns: {
          category: string
          description: string
          ends_at: string
          event_id: number
          host_avatar_url: string
          host_display_name: string
          host_id: string
          host_username: string
          i_am_interested: boolean
          interested_count: number
          location_city: string
          location_name: string
          starts_at: string
          title: string
        }[]
      }
      get_gemini_embedding: {
        Args: { interest_text: string }
        Returns: number[]
      }
      get_incoming_requests: {
        Args: never
        Returns: {
          avatar_url: string
          bio: string
          connection_id: number
          created_at: string
          display_name: string
          from_user: string
          shared_interests: string[]
          username: string
        }[]
      }
      get_my_conversations: {
        Args: never
        Returns: {
          avatar_url: string
          conversation_id: number
          display_name: string
          last_message: string
          last_message_at: string
          other_user_id: string
          unread_count: number
          username: string
        }[]
      }
      get_queue_match: {
        Args: never
        Returns: {
          event_category: string
          event_description: string
          event_host_id: string
          event_id: number
          event_location: string
          event_starts_at: string
          event_title: string
          match_avatar_url: string
          match_bio: string
          match_display_name: string
          match_profile_id: string
          match_score: number
          match_username: string
          overlap_minutes: number
          queue_kind: string
          shared_interests: string[]
          shared_windows: Json
        }[]
      }
      get_queue_status: {
        Args: never
        Returns: {
          my_queue: string
          others_in_my_queue: number
        }[]
      }
      get_recommended_meetups: {
        Args: { max_results?: number }
        Returns: {
          category: string
          description: string
          host_username: string
          location_name: string
          meetup_id: number
          similarity: number
          starts_at: string
          title: string
        }[]
      }
      get_sent_requests: {
        Args: never
        Returns: {
          avatar_url: string
          connection_id: number
          created_at: string
          display_name: string
          to_user: string
          username: string
        }[]
      }
      get_unread_count: { Args: never; Returns: number }
      is_discoverable: { Args: { p_profile_id: string }; Returns: boolean }
      join_queue: { Args: { qtype: string }; Returns: undefined }
      leave_queue: { Args: never; Returns: undefined }
      list_sessions: { Args: { p_user_id: string }; Returns: Json }
      mark_conversation_read: { Args: { conv_id: number }; Returns: number }
      meetup_embedding: { Args: { m_id: number }; Returns: number[] }
      person_dating_score: {
        Args: { me: string; other: string }
        Returns: number
      }
      person_friend_score: {
        Args: { me: string; other: string }
        Returns: number
      }
      profile_embedding: { Args: { p_id: string }; Returns: number[] }
      profile_snapshot: {
        Args: { p_user_id: string; p_viewer_id: string }
        Returns: Json
      }
      profile_text: { Args: { p_id: string }; Returns: string }
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
      record_interaction: {
        Args: {
          context_in: string
          dating_in?: boolean
          friends_in?: boolean
          met_in: boolean
          other_id: string
          rating_in: number
        }
        Returns: undefined
      }
      request_dating_match: { Args: { other_id: string }; Returns: number }
      revoke_sessions: {
        Args: { p_keep?: string; p_session_id: string; p_user_id: string }
        Returns: number
      }
      save_profile: {
        Args: {
          p_availability?: Json
          p_interests?: string[]
          p_profile: Json
          p_user_id: string
        }
        Returns: undefined
      }
      search_people: {
        Args: { max_results?: number; q: string }
        Returns: {
          avatar_url: string
          bio: string
          connection_status: string
          display_name: string
          location_city: string
          profile_id: string
          username: string
        }[]
      }
      shared_interest_labels: {
        Args: { user1: string; user2: string }
        Returns: string[]
      }
      social_reliability: { Args: { p_id: string }; Returns: number }
      user_interest_vector: { Args: { p_id: string }; Returns: number[] }
      vec_similarity: { Args: { a: number[]; b: number[] }; Returns: number }
      withdraw_event_interest: {
        Args: { meetup_id_in: number }
        Returns: undefined
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

