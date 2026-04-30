import { uploadToS3, BUCKETS } from './server/s3.js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function run() {
    const assets = [
        { file: 'fundo.jpg', name: 'default_findings.jpg' },
        { file: 'fundo1.jpg', name: 'default_sector.jpg' },
        { file: 'Plano.png', name: 'default_actionplan.png' },
        { file: 'Resolvido.png', name: 'default_resolvido.png' },
        { file: 'Resolver.png', name: 'default_resolver.png' },
        { file: 'sem-foto.png', name: 'default_sem_foto.png' }
    ];

    for (const asset of assets) {
        const filePath = path.join(process.cwd(), 'server', 'assets', 'reports', asset.file);
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}`);
            continue;
        }
        const buf = fs.readFileSync(filePath);
        const url = await uploadToS3(buf, asset.name, asset.file.endsWith('.png') ? 'image/png' : 'image/jpeg', BUCKETS.MODELOS_RELATORIOS);
        console.log(`Uploaded ${asset.file} to ${url}`);
    }
}

run().catch(console.error);
