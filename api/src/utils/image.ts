import sharp from "sharp";
import exifReader, { Exif } from "exif-reader";
import { createLogger } from "./logger";
import { S3Service } from "@/services/data";

const logger = createLogger(__filename);

export async function getImageFeatures(buffer: Buffer): Promise<{ predominantColor?: string; exif?: any }> {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    let predominantColor: string | undefined;

    // Extract predominant color from random points
    if (metadata.width && metadata.height) {
      const totalPixels = metadata.width * metadata.height;
      const numberOfPoints = totalPixels > 20_000 ? 5_000 : Math.floor(totalPixels * 0.5);

      const colorCounts = new Map<number, number>();
      const channels = metadata.channels || 3;
      let candidateColor: number | undefined = undefined;
      let maxCandidateCount = 0;

      // Get raw buffer data
      const rawBuffer = await image.raw().toBuffer();

      const borderSize = 0.1; // 10% border
      const xLeft = Math.floor(metadata.width * borderSize);
      const xRight = Math.floor(metadata.width * (1 - borderSize));
      const yTop = Math.floor(metadata.height * borderSize);
      const yBottom = Math.floor(metadata.height * (1 - borderSize));

      for (let i = 0; i < numberOfPoints; i++) {
        const quarter = i % 4;
        let x = 0,
          y = 0;
        if (quarter === 0) {
          x = Math.floor(Math.random() * xLeft);
          y = Math.floor(Math.random() * metadata.height);
        } else if (quarter === 1) {
          x = Math.floor(Math.random() * metadata.width);
          y = Math.floor(Math.random() * yTop);
        } else if (quarter === 2) {
          x = Math.floor(Math.random() * (metadata.width - xRight)) + xRight;
          y = Math.floor(Math.random() * metadata.height);
        } else {
          x = Math.floor(Math.random() * metadata.width);
          y = Math.floor(Math.random() * (metadata.height - yBottom)) + yBottom;
        }

        const offset = (y * metadata.width + x) * channels;

        if (offset + 2 < rawBuffer.length) {
          const r = Math.floor(rawBuffer[offset] / 4) * 4;
          const g = Math.floor(rawBuffer[offset + 1] / 4) * 4;
          const b = Math.floor(rawBuffer[offset + 2] / 4) * 4;

          // Pack color into a single integer
          const color = (1 << 24) + (r << 16) + (g << 8) + b;
          const count = (colorCounts.get(color) || 0) + 1;
          colorCounts.set(color, count);

          if (candidateColor === undefined || count > maxCandidateCount) {
            candidateColor = color;
            maxCandidateCount = count;
          }
        }
      }

      if (candidateColor !== undefined) {
        // Convert back to hex string
        predominantColor = `#${candidateColor.toString(16).slice(1)}`;
      }
    }

    let exif: Exif | undefined;
    if (metadata.exif) {
      try {
        exif = exifReader(metadata.exif);
        // fix possible serialization issues
        const bufferTags = [
          "OECF",
          "ExifVersion",
          "ComponentsConfiguration",
          "MakerNote",
          "UserComment",
          "SpatialFrequencyResponse",
          "FileSource",
          "SceneType",
          "CFAPattern",
          "DeviceSettingDescription",
          "SourceExposureTimesOfCompositeImage",
        ];

        for (const tag of bufferTags) {
          if (exif.Photo?.[tag]) {
            (exif.Photo[tag] as any) = Buffer.from(exif.Photo[tag] as Buffer).toString("utf-8");
          }
        }
      } catch (e) {}
    }

    return { predominantColor, exif };
  } catch (e) {
    logger.warn(e, "Failed to extract image features");
    return {};
  }
}

export async function saveImageFromBase64(
  s3Service: S3Service,
  content: string,
  { chatId, messageId, id }: { chatId: string; messageId: string; id: string }
): Promise<{ fileName: string; contentType: string; buffer: Buffer }> {
  // Parse extension from base64 content if possible, default to .png
  const matches = content.match(/^data:image\/(\w+);base64,/);
  const type = matches ? `${matches[1]}` : "png";
  const fileName = `${chatId}/${messageId}/${id}.${type}`;
  const contentType = `image/${type}`;

  // Remove data URL prefix if present (e.g., "data:image/png;base64,")
  const base64Data = content.replace(/^data:image\/[a-z0-9]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  // Upload to S3
  await s3Service.uploadFile(buffer, fileName, contentType);

  // Return the file key
  return {
    fileName,
    contentType,
    buffer,
  };
}
