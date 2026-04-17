# Sistema de Inspeção V2 - Deploy no CapRover

Esta aplicação foi reestruturada para suportar PostgreSQL, MinIO (S3) e envio de E-mails via SMTP, permitindo uma implantação segura através do CapRover na Hetzner.

## 🚀 Como fazer o Deploy no CapRover via GitHub

A aplicação já contém os arquivos necessários: `Dockerfile` (multi-stage build) e `captain-definition`.

1. Conecte seu repositório GitHub ao CapRover (Apps > Deployment > Method 3: Connect to GitHub).
2. Selecione a branch `main` (ou a branch onde o código está).
3. Antes de fazer o primeiro deploy, configure as seguintes **Variáveis de Ambiente (App Config > Environmental Variables)** no painel do seu App no CapRover:

### Variáveis Obrigatórias
```env
# URL de Conexão com o PostgreSQL do CapRover (Crie um App "One-Click Apps" Postgres primeiro)
# Exemplo se o app do banco chamar "meubanco":
DATABASE_URL="postgresql://user:password@srv-captain--meubanco:5432/inspecaov2?schema=public"

# Chave secreta para Autenticação (Qualquer string forte)
JWT_SECRET="sua_chave_super_secreta"

# Configuração do MinIO para Upload de Imagens e Relatórios (Crie um MinIO no One-Click Apps)
MINIO_ENDPOINT="http://srv-captain--meuminio:9000"
MINIO_ACCESS_KEY="seu_access_key"
MINIO_SECRET_KEY="sua_secret_key"
MINIO_BUCKET="inspecaov2"

# Configuração do Servidor SMTP (Seu provedor de e-mail)
SMTP_HOST="smtp.seudominio.com.br"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="contato@seudominio.com.br"
SMTP_PASS="senha_do_email"

# (Opcional) Chave da API do Gemini se for utilizar funções IA
GEMINI_API_KEY="sua_chave_gemini"
```

## 🗄️ Configuração do Banco de Dados (init.sql)
Para criar as tabelas do sistema em seu PostgreSQL:
1. Acesse seu banco de dados (ex: pelo DBeaver, pgAdmin, ou Adminer do CapRover).
2. Copie todo o conteúdo do arquivo localizado na raiz `init.sql`.
3. Execute o script. Ele já possui as tabelas (`User`, `Inspection`, `Report`, etc) e insere um **Usuário Master** padrão.

> **Login Master Padrão**
> Email: `admin@master.com`
> Senha: `master123`

---

## 💻 Desenvolvimento Local
1. `npm install`
2. Crie um arquivo `.env` baseado no `.env.example`
3. Inicie o PostgreSQL localmente e rode `npx prisma migrate dev`
4. `npm run dev` para rodar frontend (na porta 3000)
5. `npm run server` ou `npx tsx server/index.ts` para rodar o backend.
