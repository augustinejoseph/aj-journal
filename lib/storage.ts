import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
function client() {
  return new S3Client({
    region: "auto",
    // The browser supplies the body after signing; do not checksum an empty body.
    requestChecksumCalculation: "WHEN_REQUIRED",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}
const bucket = () => process.env.R2_BUCKET!;
export const storage = {
  upload: (key: string, mime: string) =>
    getSignedUrl(
      client(),
      new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime }),
      { expiresIn: 180 },
    ),
  read: (key: string) =>
    getSignedUrl(
      client(),
      new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
        ResponseCacheControl: "private, max-age=31536000, immutable",
      }),
      { expiresIn: 180 },
    ),
  head: (key: string) =>
    client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key })),
  remove: (key: string) =>
    client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })),
};
