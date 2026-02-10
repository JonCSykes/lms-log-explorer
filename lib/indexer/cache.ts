import * as fs from 'node:fs'

/**
 * File cache entry with mtime tracking
 */
export interface CacheEntry {
  path: string
  mtime: Date
  size: number
}

/**
 * File system cache for log files
 */
export class FileSystemCache {
  private entries: Map<string, CacheEntry> = new Map()

  /**
   * Get cached entry for file
   */
  get(path: string): CacheEntry | undefined {
    return this.entries.get(path)
  }

  /**
   * Check if file has been modified since last cache
   */
  isModified(path: string): boolean {
    const entry = this.entries.get(path)
    if (!entry) {
      return true
    }

    try {
      const stats = fs.statSync(path)
      return stats.mtime.getTime() !== entry.mtime.getTime()
    } catch (e) {
      return true
    }
  }

  /**
   * Update cache entry for file
   */
  update(path: string): void {
    try {
      const stats = fs.statSync(path)
      this.entries.set(path, {
        path,
        mtime: stats.mtime,
        size: stats.size,
      })
    } catch (e) {
      this.entries.delete(path)
    }
  }

  /**
   * Clear cache entry
   */
  clear(path: string): void {
    this.entries.delete(path)
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.entries.clear()
  }
}

/**
 * Index cache with file mtime tracking
 */
export class IndexCache {
  private parsedFiles: FileSystemCache = new FileSystemCache()

  /**
   * Check if file needs re-parsing
   */
  shouldReparse(path: string): boolean {
    return this.parsedFiles.isModified(path)
  }

  /**
   * Mark file as parsed
   */
  markParsed(path: string): void {
    this.parsedFiles.update(path)
  }

  /**
   * Clear cache for file
   */
  clearFile(path: string): void {
    this.parsedFiles.clear(path)
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.parsedFiles.clearAll()
  }
}

/**
 * Global index cache instance
 */
export const indexCache = new IndexCache()
