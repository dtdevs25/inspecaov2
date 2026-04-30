import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';

// MinIO S3 Client
export const s3 = new S3Client({
    region: process.env.S3_REGION || 'eu-east-1',
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    credentials: {
        accessKeyId: process.env.S3_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET || 'minioadmin'
    },
    forcePathStyle: true // Needed for MinIO
});

// Constantes de Buckets para facilitar importação e não cometer typos
export const BUCKETS = {
    FOTO_INSPECAO: 'foto-inspecao',
    FOTO_PLANODEACAO: 'foto-planodeacao',
    FOTO_PROJETO: 'foto-projeto',
    LOGO_EMPRESA: 'logo-empresa',
    RELATORIO_PDF: 'relatorio-pdf',
    MODELOS_RELATORIOS: 'modelos-relatorios'
};

// Configuração do Multer (mantém em memória para enviar pro S3)
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit para relatórios PDF e fotos maiores
});

export const uploadToS3 = async (fileBuffer: Buffer, fileName: string, mimetype: string, bucketName: string) => {
    try {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: fileName,
            Body: fileBuffer,
            ContentType: mimetype,
        });

        await s3.send(command);

        // Usa a rota proxy interna do próprio backend para servir as imagens.
        // Isso evita problemas com o endpoint S3 interno (storage-api) não sendo
        // acessível publicamente no browser para renderização de imagens.
        return `/api/files/${bucketName}/${fileName}`;
    } catch (error) {
        console.error(`Error uploading to MinIO S3 (Bucket: ${bucketName}):`, error);
        throw error;
    }
};
