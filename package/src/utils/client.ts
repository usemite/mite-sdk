import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

export const DEFAULT_BASE_URL = 'https://usemite.com'
const RETRY_COUNT_HEADER = '__mite_retry_count'

export interface ApiClientOptions {
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * HTTP client for making API requests to the Mite backend.
 */
export class ApiClient {
  private client: AxiosInstance
  private maxRetries: number

  constructor(options: ApiClientOptions) {
    this.maxRetries = options.maxRetries ?? 0

    this.client = axios.create({
      baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
      timeout: options.timeout ?? 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (options.headers) {
      this.updateHeaders(options.headers)
    }

    // Set up retry BEFORE error logging so retried requests
    // don't produce spurious error logs
    if (this.maxRetries > 0) {
      this.setupRetry()
    }

    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          console.error('[Mite] Server error:', {
            status: error.response.status,
            data: error.response.data,
          })
        } else if (error.request) {
          console.error('[Mite] Network error:', error.message)
        } else {
          console.error('[Mite] Request setup error:', error.message)
        }
        return Promise.reject(error)
      },
    )
  }

  private setupRetry(): void {
    this.client.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config
        if (!config) return Promise.reject(error)

        // A 4xx is not transient. A retry gives the same answer, so it only
        // costs battery and delays the error the developer sees. This covers
        // the 402 plan quota refusals, which cannot change until the plan
        // changes or the billing period ends.
        const status = error.response?.status
        if (typeof status === 'number' && status >= 400 && status < 500) {
          return Promise.reject(error)
        }

        const retryCount = (config[RETRY_COUNT_HEADER] as number) ?? 0
        if (retryCount >= this.maxRetries) {
          return Promise.reject(error)
        }

        config[RETRY_COUNT_HEADER] = retryCount + 1
        const backoff = Math.min(1000 * 2 ** (retryCount + 1), 10000)
        await new Promise<void>(resolve => setTimeout(resolve, backoff))

        return this.client(config)
      },
    )
  }

  public getAxiosInstance(): AxiosInstance {
    return this.client
  }

  public updateHeaders(headers: Record<string, string>): void {
    Object.assign(this.client.defaults.headers.common, headers)
  }

  public async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config)
    return response.data
  }

  public async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.post<T>(url, data, config)
    return response.data
  }

  public async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.put<T>(url, data, config)
    return response.data
  }

  public async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config)
    return response.data
  }
}
