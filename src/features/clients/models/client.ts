import { BaseEntity } from "@/shared/types/baseEntity";

export interface ClientPhone {
  id: number | string;
  nome: string;
  numero: string;
}

export interface Client extends BaseEntity {
  code?: string;
  business_name: string;
  address?: string;
  city?: string;
  postal_code?: string;
  province?: string;
  vat_number?: string;
  fiscal_code?: string;
  sdi_code?: string;
  pec?: string;
  payment_method?: string;
  destination_name?: string;
  destination_address?: string;
  destination_city?: string;
  phones: ClientPhone[];
  notes?: string;
  is_active: boolean;
}

export interface CreateClientInput {
  code?: string;
  business_name: string;
  address?: string;
  city?: string;
  postal_code?: string;
  province?: string;
  vat_number?: string;
  fiscal_code?: string;
  sdi_code?: string;
  pec?: string;
  payment_method?: string;
  destination_name?: string;
  destination_address?: string;
  destination_city?: string;
  phones?: ClientPhone[];
  notes?: string;
}
