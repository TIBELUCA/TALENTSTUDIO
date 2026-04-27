import fs from "fs";
import path from "path";

export interface FileStorageProvider {
  upload(filename: string, data: Buffer): Promise<string>;
  uploadFromPath(filename: string, sourcePath: string): Promise<string>;
  download(filename: string): Promise<Buffer>;
  delete(filename: string): Promise<void>;
  exists(filename: string): Promise<boolean>;
  getUrl(filename: string): string;
  list(filter?: RegExp): Promise<string[]>;
  getFullPath(filename: string): string;
  stat(filename: string): Promise<{ size: number; mtime: Date } | null>;
}

export class LocalFileStorageProvider implements FileStorageProvider {
  constructor(
    private readonly baseDir: string,
    private readonly urlPrefix: string,
  ) {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  async upload(filename: string, data: Buffer): Promise<string> {
    const filePath = path.join(this.baseDir, filename);
    fs.writeFileSync(filePath, data);
    return this.getUrl(filename);
  }

  async uploadFromPath(filename: string, sourcePath: string): Promise<string> {
    const dest = path.join(this.baseDir, filename);
    if (sourcePath !== dest) {
      fs.copyFileSync(sourcePath, dest);
    }
    return this.getUrl(filename);
  }

  async download(filename: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, filename);
    return fs.readFileSync(filePath);
  }

  async delete(filename: string): Promise<void> {
    const filePath = path.join(this.baseDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async exists(filename: string): Promise<boolean> {
    return fs.existsSync(path.join(this.baseDir, filename));
  }

  getUrl(filename: string): string {
    return `${this.urlPrefix}/${filename}`;
  }

  getFullPath(filename: string): string {
    return path.join(this.baseDir, filename);
  }

  async list(filter?: RegExp): Promise<string[]> {
    if (!fs.existsSync(this.baseDir)) return [];
    const files = fs.readdirSync(this.baseDir);
    return filter ? files.filter((f) => filter.test(f)) : files;
  }

  async stat(filename: string): Promise<{ size: number; mtime: Date } | null> {
    const filePath = path.join(this.baseDir, filename);
    if (!fs.existsSync(filePath)) return null;
    const s = fs.statSync(filePath);
    return { size: s.size, mtime: s.mtime };
  }
}

const ASSETS_BASE = path.join(process.cwd(), "server/assets");

export const machineImageStorage = new LocalFileStorageProvider(
  path.join(ASSETS_BASE, "machine-images"),
  "/machine-images",
);

export const enquiryAttachmentStorage = new LocalFileStorageProvider(
  path.join(ASSETS_BASE, "enquiry-attachments"),
  "/enquiry-attachments",
);

export const layoutDrawingStorage = new LocalFileStorageProvider(
  path.join(ASSETS_BASE, "layout-drawings"),
  "/layout-drawings",
);

export const shareHubAttachmentStorage = new LocalFileStorageProvider(
  path.join(ASSETS_BASE, "share-hub-attachments"),
  "/share-hub-attachments",
);

export const drawingsFileStorage = new LocalFileStorageProvider(
  path.join(ASSETS_BASE, "drawings"),
  "/drawings-files",
);

export const drawingAttachmentStorage = new LocalFileStorageProvider(
  path.join(ASSETS_BASE, "drawing-attachments"),
  "/drawing-attachments",
);

export const emailLinkedAttachmentStorage = new LocalFileStorageProvider(
  path.join(ASSETS_BASE, "email-linked-attachments"),
  "/email-linked-attachments",
);
