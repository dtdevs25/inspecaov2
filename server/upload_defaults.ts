import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const s3 = new S3Client({
    region: process.env.S3_REGION || 'eu-east-1',
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    credentials: {
        accessKeyId: process.env.S3_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET || 'minioadmin'
    },
    forcePathStyle: true
});

const BUCKET = 'modelos-relatorios';

async function upload(file: string, key: string, contentType: string) {
    const filePath = path.join(process.cwd(), 'server', 'assets', 'reports', file);
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return;
    }
    const buf = fs.readFileSync(filePath);
    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buf,
        ContentType: contentType
    }));
    console.log(`Uploaded ${file} as ${key}`);
}

async function run() {
    const assets = [
        { file: 'fundo.jpg', key: 'default_findings.jpg', type: 'image/jpeg' },
        { file: 'fundo1.jpg', key: 'default_sector.jpg', type: 'image/jpeg' },
        { file: 'Plano.png', key: 'default_actionplan.png', type: 'image/png' },
        { file: 'Resolvido.png', key: 'default_resolvido.png', type: 'image/png' },
        { file: 'Resolver.png', key: 'default_resolver.png', type: 'image/png' }
    ];

    for (const asset of assets) {
        await upload(asset.file, asset.key, asset.type);
    }
    console.log('Upload de modelos gerais concluído!');
}

run().catch(console.error);
