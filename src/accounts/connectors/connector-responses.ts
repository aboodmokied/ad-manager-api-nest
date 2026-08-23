/**
 * Minimal shapes of provider API responses used by the connectors.
 * Payloads are defensive (all fields optional) because the providers change
 * schemas without notice, but the mapping code is no longer `any`.
 */

export interface MetaAccountResponse {
  id?: string;
  name?: string;
  currency?: string;
}

export interface MetaCampaignResponse {
  id?: string;
  name?: string;
  status?: string;
  start_time?: string;
  stop_time?: string;
  daily_budget?: string | number;
}

export interface MetaPagedResponse<T> {
  data?: T[];
  paging?: { next?: string };
}

export interface LinkedInDateValue {
  year?: number | string;
  month?: number | string;
  day?: number | string;
}

export interface LinkedInCampaignResponse {
  id?: string;
  name?: string;
  status?: string;
  dailyBudget?: {
    amount?: string | number;
    currencyCode?: string;
  };
  startDate?: LinkedInDateValue;
  endDate?: LinkedInDateValue;
}

export interface LinkedInAccountResponse {
  id?: string;
  name?: string;
}

export interface LinkedInPagedResponse<T> {
  elements?: T[];
}

export interface XCampaignResponse {
  id?: string;
  name?: string;
  status?: string;
  daily_funding_amount_in_micro_currency?: string | number;
  start_time?: string;
  end_time?: string;
}

export interface XAccountResponse {
  id?: string;
  name?: string;
}

export interface XPagedResponse<T> {
  data?: T[];
  next_cursor?: string;
}

export interface SnapchatCampaignResponse {
  id?: string;
  name?: string;
  status?: string;
  daily_budget_micro?: string | number;
  start_time?: string;
  end_time?: string;
}

export interface SnapchatAccountResponse {
  id?: string;
  name?: string;
}

export interface SnapchatPagedResponse<T> {
  adaccounts?: SnapchatAccountResponse[];
  campaigns?: T[];
  paging?: { next_link?: string };
}

export interface TiktokCampaignResponse {
  campaign_id?: string;
  campaign_name?: string;
  status?: string;
  budget?: string | number;
  daily_budget?: string | number;
  start_time?: string | number;
  end_time?: string | number;
}

export interface TiktokAccountResponse {
  advertiser_id?: string;
  advertiser_name?: string;
  name?: string;
}

export interface TiktokPagedResponse<T> {
  code?: number;
  data?: {
    list?: T[];
    page_info?: { total_page?: number };
  };
}

export interface GoogleCampaignRow {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };
  campaignBudget?: { amountMicros?: string | number };
}

export interface GoogleSearchStreamBatch {
  results?: GoogleCampaignRow[];
}
