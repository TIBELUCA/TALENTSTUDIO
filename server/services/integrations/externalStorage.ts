import { logIntegration } from "./logger";

export interface ExternalStorageUploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export interface ExternalStorageProvider {
  upload(key: string, data: Buffer, contentType?: string): Promise<ExternalStorageUploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
}

export class NoOpExternalStorageProvider implements ExternalStorageProvider {
  async upload(key: string, data: Buffer, contentType?: string): Promise<ExternalStorageUploadResult> {
    logIntegration({
      service: "externalStorage",
      action: "upload",
      status: "success",
      message: `No-op: would upload ${key} (${data.length} bytes, ${contentType ?? "unknown"})`,
    });
    return { success: true, url: `https://placeholder.local/${key}`, key };
  }

  async download(key: string): Promise<Buffer> {
    logIntegration({
      service: "externalStorage",
      action: "download",
      status: "failure",
      message: `No-op provider cannot download: ${key}`,
    });
    throw new Error(`No-op external storage: cannot download "${key}". Configure a real provider.`);
  }

  async delete(key: string): Promise<void> {
    logIntegration({
      service: "externalStorage",
      action: "delete",
      status: "success",
      message: `No-op: would delete ${key}`,
    });
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    logIntegration({
      service: "externalStorage",
      action: "getSignedUrl",
      status: "success",
      message: `No-op: would generate signed URL for ${key} (expires ${expiresInSeconds}s)`,
    });
    return `https://placeholder.local/${key}?expires=${expiresInSeconds}`;
  }

  async exists(key: string): Promise<boolean> {
    logIntegration({
      service: "externalStorage",
      action: "exists",
      status: "success",
      message: `No-op: would check existence of ${key}`,
    });
    return false;
  }
}
