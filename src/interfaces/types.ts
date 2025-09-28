export interface TokenUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

export interface RateLimit {
  used_percent: number;
  resets_in_seconds: number;
  window_minutes: number;
}

export interface TokenCountPayload {
  type: 'token_count';
  info: {
    total_token_usage: TokenUsage;
    last_token_usage: TokenUsage;
  };
  rate_limits?: {
    primary?: RateLimit;    // 5-hour limit
    secondary?: RateLimit;  // Weekly limit
  };
}

export interface EventRecord {
  type: 'event_msg';
  timestamp: string;
  payload: TokenCountPayload;
}

export interface RateLimitData {
  file_path: string;
  record_timestamp: Date;
  current_time: Date;
  total_usage: TokenUsage;
  last_usage: TokenUsage;
  primary?: {
    used_percent: number;
    time_percent: number;
    reset_time: Date;
    outdated: boolean;
    window_minutes: number;
  };
  secondary?: {
    used_percent: number;
    time_percent: number;
    reset_time: Date;
    outdated: boolean;
    window_minutes: number;
  };
}

export interface ParseResult {
  found: boolean;
  data?: RateLimitData;
  error?: string;
}