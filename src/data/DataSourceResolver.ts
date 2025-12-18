/**
 * @fileoverview Data Source Resolver
 *
 * Environment-aware data source resolution for hybrid deployment.
 * Supports local development (file system) and production (S3/CDN).
 *
 * Architecture: Strategy pattern for source resolution, enabling
 * seamless switching between development and production environments.
 */

/**
 * Resolved data source configuration.
 */
export interface DataSource {
  /** Base URL for asset loading */
  baseUrl: string;
  /** Whether using cloud storage (S3) */
  isCloud: boolean;
  /** Environment identifier */
  environment: 'development' | 'production';
}

/**
 * DataSourceResolver - Cloud-agnostic asset URL resolution.
 *
 * Determines the correct base URL for assets based on environment
 * configuration. Handles URL normalization and validation.
 *
 * @example
 * ```ts
 * const resolver = new DataSourceResolver();
 * const source = resolver.resolve();
 *
 * console.log(source.baseUrl); // '/scans' or 'https://cdn.example.com/assets'
 * console.log(source.isCloud); // false or true
 * ```
 */
export class DataSourceResolver {
  private readonly envVariable: string | undefined;

  constructor() {
    this.envVariable = process.env.NEXT_PUBLIC_DATA_SOURCE;
  }

  /**
   * Resolve the current data source.
   */
  resolve(): DataSource {
    const isCloud = this.isCloudSource();

    return {
      baseUrl: this.getBaseUrl(),
      isCloud,
      environment: isCloud ? 'production' : 'development',
    };
  }

  /**
   * Build a complete asset URL.
   *
   * @param relativePath - Path relative to base (e.g., 'Area_1/room.ply')
   */
  buildAssetUrl(relativePath: string): string {
    const { baseUrl } = this.resolve();
    const normalizedPath = relativePath.replace(/^\/+/, '');
    return `${baseUrl}/${normalizedPath}`;
  }

  /**
   * Check if using cloud storage.
   */
  private isCloudSource(): boolean {
    return Boolean(this.envVariable?.startsWith('http'));
  }

  /**
   * Get normalized base URL.
   */
  private getBaseUrl(): string {
    if (!this.envVariable) {
      return '/scans';
    }

    if (this.envVariable.startsWith('http')) {
      return this.envVariable.replace(/\/+$/, '');
    }

    return '/scans';
  }
}

/**
 * Singleton instance for application-wide access.
 */
export const dataSourceResolver = new DataSourceResolver();
