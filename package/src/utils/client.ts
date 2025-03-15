import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

const BASE_URL = 'http://localhost:8787'

export interface ApiClientOptions {
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Creates a configured axios client for making API requests to Supabase
 */
export class ApiClient {
  private static instance: ApiClient
  private client: AxiosInstance

  private constructor(options: ApiClientOptions) {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: options.timeout ?? 10000,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    // Setup response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          console.error('[Mite] Server error:', {
            status: error.response.status,
            data: error.response.data
          })
        } else if (error.request) {
          console.error('[Mite] Network error:', error.message)
        } else {
          console.error('[Mite] Request setup error:', error.message)
        }
        return Promise.reject(error)
      }
    )

    // Setup retries if configured
    if (options.maxRetries && options.maxRetries > 0) {
      this.setupRetry(options.maxRetries)
    }
  }

  /**
   * Gets the singleton instance of ApiClient, creating it if necessary
   */
  public static getInstance(options?: ApiClientOptions): ApiClient {
    if (!ApiClient.instance && options) {
      ApiClient.instance = new ApiClient(options)
    } else if (!ApiClient.instance) {
      throw new Error('[Mite] ApiClient must be initialized with options first')
    }

    return ApiClient.instance
  }

  /**
   * Setup retry logic for failed requests
   */
  private setupRetry(maxRetries: number): void {
    let retryCount = 0

    this.client.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config

        if (!config || retryCount >= maxRetries) {
          return Promise.reject(error)
        }

        retryCount += 1
        const backoff = Math.min(1000 * (2 ** retryCount), 10000)
        await new Promise(resolve => setTimeout(resolve, backoff))

        return this.client(config)
      }
    )
  }

  /**
   * Gets the underlying axios instance
   */
  public getAxiosInstance(): AxiosInstance {
    return this.client
  }

  /**
   * Update headers for the client
   */
  public updateHeaders(headers: Record<string, string>): void {
    Object.assign(this.client.defaults.headers.common, headers)
  }

  /**
   * Send a GET request
   */
  public async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config)
    return response.data
  }

  /**
   * Send a POST request
   */
  public async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config)
    return response.data
  }

  /**
   * Send a PUT request
   */
  public async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config)
    return response.data
  }

  /**
   * Send a DELETE request
   */
  public async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config)
    return response.data
  }
}

/**
 * Create a supabase-specific client with the provided credentials
 */
export function createSupabaseClient(
  supabaseKey: string,
  options: Omit<ApiClientOptions, 'baseURL'> = {}
): ApiClient {
  return ApiClient.getInstance({
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    },
    ...options
  })
}
