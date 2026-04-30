import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import apiRoutes from './routes';
import http from 'http';

dotenv.config();

// ============================================================
// SECURITY STARTUP CHECKS — Fails loudly if secrets are default
// ============================================================
const INSECURE_DEFAULTS = ['super-secret-key-123', 'minioadmin', ''];
const checkEnvVar = (name: string, value: string | undefined, insecureValues: string[]) => {
    if (!value || insecureValues.includes(value)) {
        const msg = `\x1b[41m\x1b[37m⚠️  SEGURANÇA CRÍTICA: A variável de ambiente '${name}' está usando um valor padrão inseguro. Defina-a no seu .env!\x1b[0m`;
        console.error(msg);
        if (process.env.NODE_ENV === 'production') {
            console.warn(`\x1b[43m\x1b[30m⚠️ ALERTA: O servidor está rodando em produção com configurações padrão inseguras (${name}). Configure as variáveis de ambiente no CapRover imediatamente!\x1b[0m`);
            // process.exit(1); 
        }
    }
};

checkEnvVar('JWT_SECRET', process.env.JWT_SECRET, INSECURE_DEFAULTS);
checkEnvVar('S3_KEY', process.env.S3_KEY, INSECURE_DEFAULTS);
checkEnvVar('S3_SECRET', process.env.S3_SECRET, INSECURE_DEFAULTS);
// ============================================================

const app = express();
app.use(compression());
app.set('trust proxy', 1); // Confia no proxy do CapRover (NGINX) para o limitador de chamadas
const server = http.createServer(app);
const port = process.env.PORT || 3000;

app.use(helmet({
  crossOriginResourcePolicy: false, // allow images to load externally
}));

// SECURITY: Restrict CORS to known frontend origin
const allowedOrigin = process.env.FRONTEND_URL || '';
app.use(cors(allowedOrigin ? {
    origin: allowedOrigin,
    credentials: true
} : undefined)); // In dev (no FRONTEND_URL), allow all

app.use(express.json());

// Middlewares later for Auth
// app.use('/api', authenticateToken);

// Registra as rotas da API sob o prefixo /api
app.use('/api', apiRoutes);

// Em caprover, se quisermos usar a mesma porta para o front-end buildado
// Apenas rodamos npm run build e colocamos na pasta dist.
app.use('/logos', express.static(path.join(process.cwd(), 'logos')));
app.use(express.static(path.join(process.cwd(), 'dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

import { startCronJobs } from './cron';

app.listen(port, () => {
  console.log(`Server rodando na porta ${port}`);
  startCronJobs();
});
