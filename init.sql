-- Script de Inicialização - INSPEÇÃO V2
-- Criação do banco de dados em Português-BR (configuração de Collation)
-- Para uso no CapRover PostgreSQL

-- Criação da base de dados com collation apropriada (caso já não exista)
-- CREATE DATABASE inspecaov2 WITH LC_COLLATE = 'pt_BR.utf8' LC_CTYPE = 'pt_BR.utf8';
-- \c inspecaov2;

-- Deletar tabelas caso já existam para recriar (Cuidado ao aplicar em produção!)
DROP TABLE IF EXISTS "WeeklyReport";
DROP TABLE IF EXISTS "Report";
DROP TABLE IF EXISTS "Inspection";
DROP TABLE IF EXISTS "User";

-- Tabela User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT NOT NULL,
    "photoURL" TEXT,
    "role" TEXT NOT NULL DEFAULT 'Usuário Comum',
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Tabela Inspection
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "sector" TEXT,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- Tabela Report
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "photoUrl" TEXT,
    "reporterName" TEXT,
    "reporterContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- Tabela WeeklyReport
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- Índices e Relacionamentos Únicos
CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Chaves Estrangeiras
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Inserir o usuário Master padrão para acesso inicial
INSERT INTO "User" ("id", "uid", "displayName", "email", "role", "password")
VALUES (
    'master-default-id',
    'master-uid',
    'Master Admin',
    'admin@master.com',
    'Master',
    '$2b$10$oXhEaA4f.3hF0l.xL666EOTm4Gtj4j2wzS6l47T2T9W9eF6xP1JmS' -- Criptografado usando bcrypt para a senha 'master123'
);
