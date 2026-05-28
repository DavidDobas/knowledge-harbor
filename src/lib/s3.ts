import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3() {
  return new S3Client({
    region: process.env.AWS_REGION!,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

function getBucket() {
  return process.env.S3_BUCKET_NAME!;
}

export async function uploadToS3(key: string, body: Buffer, contentType: string) {
  await getS3().send(new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function getPresignedUrl(key: string): Promise<string> {
  return getSignedUrl(getS3(), new GetObjectCommand({ Bucket: getBucket(), Key: key }), { expiresIn: 3600 });
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  const res = await getS3().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}
