export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      agencies: {
        Row: {
          id: string
          name: string
          type: 'ima' | 'bar' | 'nightclub'
          created_at: string
          updated_at: string
          settings: Json
        }
        Insert: {
          id?: string
          name: string
          type: 'ima' | 'bar' | 'nightclub'
          created_at?: string
          updated_at?: string
          settings?: Json
        }
        Update: {
          id?: string
          name?: string
          type?: 'ima' | 'bar' | 'nightclub'
          created_at?: string
          updated_at?: string
          settings?: Json
        }
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'producer' | 'finance' | 'manager' | 'owner'
          agency_id: string
          avatar_url: string | null
          created_at: string
          updated_at: string
          onboarded: boolean
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role: 'producer' | 'finance' | 'manager' | 'owner'
          agency_id: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          onboarded?: boolean
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: 'producer' | 'finance' | 'manager' | 'owner'
          agency_id?: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          onboarded?: boolean
        }
      }
      events: {
        Row: {
          id: string
          agency_id: string
          producer_id: string
          event_date: string
          weekday: string
          business_name: string
          invoice_name: string
          amount: number
          approver: string | null
          doc_type: 'tax_invoice' | 'receipt' | 'payment_request'
          doc_number: string | null
          due_date: string | null
          status: 'draft' | 'pending' | 'approved' | 'paid' | 'cancelled'
          notes: string | null
          created_at: string
          updated_at: string
          client_id: string | null
          artist_id: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          producer_id: string
          event_date: string
          weekday: string
          business_name: string
          invoice_name: string
          amount: number
          approver?: string | null
          doc_type: 'tax_invoice' | 'receipt' | 'payment_request'
          doc_number?: string | null
          due_date?: string | null
          status?: 'draft' | 'pending' | 'approved' | 'paid' | 'cancelled'
          notes?: string | null
          created_at?: string
          updated_at?: string
          client_id?: string | null
          artist_id?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          producer_id?: string
          event_date?: string
          weekday?: string
          business_name?: string
          invoice_name?: string
          amount?: number
          approver?: string | null
          doc_type?: 'tax_invoice' | 'receipt' | 'payment_request'
          doc_number?: string | null
          due_date?: string | null
          status?: 'draft' | 'pending' | 'approved' | 'paid' | 'cancelled'
          notes?: string | null
          created_at?: string
          updated_at?: string
          client_id?: string | null
          artist_id?: string | null
        }
      }
      artists: {
        Row: {
          id: string
          agency_id: string
          name: string
          vat_id: string | null
          phone: string | null
          email: string | null
          bank_name: string | null
          bank_branch: string | null
          bank_account: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          name: string
          vat_id?: string | null
          phone?: string | null
          email?: string | null
          bank_name?: string | null
          bank_branch?: string | null
          bank_account?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          name?: string
          vat_id?: string | null
          phone?: string | null
          email?: string | null
          bank_name?: string | null
          bank_branch?: string | null
          bank_account?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          agency_id: string
          name: string
          vat_id: string | null
          phone: string | null
          email: string | null
          address: string | null
          contact_person: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          name: string
          vat_id?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          contact_person?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          name?: string
          vat_id?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          contact_person?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          agency_id: string
          name: string
          type: 'agreement' | 'invoice' | 'receipt' | 'contract'
          template: string
          variables: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          name: string
          type: 'agreement' | 'invoice' | 'receipt' | 'contract'
          template: string
          variables?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          name?: string
          type?: 'agreement' | 'invoice' | 'receipt' | 'contract'
          template?: string
          variables?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
