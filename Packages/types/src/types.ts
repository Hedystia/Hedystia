export interface RouteInfo {
  method: string;
  path: string;
  params?: unknown;
  query?: unknown;
  headers?: unknown;
  body?: unknown;
  response?: unknown;
  data?: unknown;
  error?: unknown;
  message?: unknown;
}
