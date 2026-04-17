import express from 'express';
import bcrypt from 'bcrypt';
import { GoogleGenAI } from '@google/genai';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from './email';
import { LegacyReportService } from './reports/LegacyReportService';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';

const logAction = async (user: any, action: string, resource: string, details: any) => {
    try {
        if (resource === 'system_logs') return; 
        const detailsStr = typeof details === 'object' ? JSON.stringify(details).substring(0, 500) : String(details).substring(0, 500);
        await prisma.systemLog.create({
            data: {
                userId: String(user?.id || 'unknown'),
                userName: String(user?.displayName || user?.email || 'Sistema'),
                userEmail: String(user?.email || 'sistema@ehspro.com.br'),
                action,
                resource,
                details: detailsStr,
                createdAt: new Date()
            }
        });
    } catch (e) {
        console.error('Falha ao registrar log:', e);
    }
};

// Returns a human-friendly label for an entity (e.g. "Inspeção #00012", "Plano de Ação #00003")
const getFriendlyLabel = async (collection: string, id: string, record?: any): Promise<string> => {
    const collectionLabels: Record<string, string> = {
        'inspections': 'Inspeção',
        'action_plans': 'Plano de Ação',
        'reports': 'Apontamento',
        'weekly_reports': 'Relatório Semanal',
        'projects': 'Projeto',
        'companies': 'Empresa',
        'units': 'Filial',
        'sectors': 'Setor',
        'locations': 'Local',
        'users': 'Usuário',
        'type_of_entries': 'Tipo de Entrada',
        'report_templates': 'Modelo de Relatório',
    };
    const label = collectionLabels[collection] || 'Registro';

    // For named entities, show the name directly
    if (record?.name) return `${label}: ${record.name}`;
    if (record?.displayName) return `${label}: ${record.displayName}`;
    if (record?.email && collection === 'users') return `Usuário: ${record.email}`;

    // For numbered entities, compute sequential number
    if (['inspections', 'action_plans', 'reports', 'weekly_reports', 'projects'].includes(collection)) {
        try {
            const modelKey = ({
                'inspections': 'inspection',
                'action_plans': 'actionPlan',
                'reports': 'report',
                'weekly_reports': 'weeklyReport',
                'projects': 'project',
            } as any)[collection];

            if (!modelKey) return `${label}: ${id.substring(0, 8)}...`;
            
            const model = (prisma as any)[modelKey];
            if (!model) return `${label}: ${id.substring(0, 8)}...`;

            const position = await model.count({ where: { createdAt: { lte: record?.createdAt || new Date() } } });
            const seqNum = String(position).padStart(5, '0');
            const extra = record?.description ? ` - ${String(record.description).substring(0, 40)}` : '';
            return `${label} #${seqNum}${extra}`;
        } catch (err) {
            console.error('Erro ao gerar label amigável:', err);
            return `${label}: ${id.substring(0, 8)}...`;
        }
    }

    return `${label}: ${id.substring(0, 8)}...`;
};

const getTenantFilter = async (user: any, collection: string) => {
    if (!user || user.role === 'Master') return {};
    
    const companies: string[] = user.companies || [];
    const units: string[]    = user.units || [];
    const sectors: string[]  = user.sectors || [];
    const locations: string[] = user.locations || [];

    let myCompanyNames = user.companyNames;
    if (!myCompanyNames && companies.length > 0) {
         const comps = await prisma.company.findMany({ where: { id: { in: companies } }, select: { name: true } });
         myCompanyNames = comps.map(c => c.name);
    }
    myCompanyNames = myCompanyNames || [];

    // Admins see everything related to their companies
    if (user.role === 'Administrador') {
        if (collection === 'companies') return { id: { in: companies } };
        if (collection === 'users') return { companies: { hasSome: companies } };
        if (['type_of_entries'].includes(collection)) return {};
        if (collection === 'reports') return { company: { in: myCompanyNames, mode: 'insensitive' } };
        if (collection === 'action_plans') {
             return { OR: [{ companyId: { in: companies } }, { company: { in: myCompanyNames, mode: 'insensitive' } }] };
        }
        if (collection === 'inspections') {
             return { OR: [{ companyId: { in: companies } }, { companyName: { in: myCompanyNames, mode: 'insensitive' } }] };
        }
        return { companyId: { in: companies } };
    }

    // Gestor: sees data only within their responsible sectors or locations
    if (user.role === 'Gestor') {
        if (['inspections', 'action_plans', 'reports', 'weekly_reports', 'projects'].includes(collection)) {
            const mySectorNames: string[] = user.sectorNames || [];
            const myUnitNames: string[]   = user.unitNames || [];
            const conditions: any[] = [];
            
            // 1. Direct UUID match
            if (sectors.length > 0 && collection !== 'projects') conditions.push({ sectorId: { in: sectors } });
            if (locations.length > 0 && collection !== 'projects') conditions.push({ locationId: { in: locations } });
            
            // For projects, we filter by unit assignment (since they don't have sectors)
            if (collection === 'projects' && units.length > 0) {
                conditions.push({ unitId: { in: units } });
            }

            // 2. Name-based match (Legacy Fallback)
            // Scoping: We only trust the name-match if it's within the Gestor's assigned Units/Companies
            if (mySectorNames.length > 0) {
                const nameField = collection === 'action_plans' ? 'sector' : 'sectorName';
                const unitNameField = ['action_plans', 'weekly_reports', 'reports'].includes(collection) ? 'unit' : 'unitName';
                const myUnitNames: string[] = user.unitNames || [];

                mySectorNames.forEach(name => {
                    const baseCondition: any = { 
                        [nameField]: { equals: name, mode: 'insensitive' } 
                    };
                    
                    const unitConditions: any[] = [];
                    
                    // Scope by Unit ID if record has one
                    if (units.length > 0) {
                        unitConditions.push({ unitId: { in: units } });
                    }
                    
                    // Scope by Unit Name if record is legacy (common for strings but no IDs)
                    if (myUnitNames.length > 0) {
                        unitConditions.push({ [unitNameField]: { in: myUnitNames, mode: 'insensitive' } });
                    }

                    if (unitConditions.length > 0) {
                        conditions.push({ ...baseCondition, OR: unitConditions });
                    } else if (companies.length > 0) {
                        // Match Name AND Company ID
                        if (collection === 'reports') {
                            conditions.push({ ...baseCondition, company: { in: myCompanyNames, mode: 'insensitive' } });
                        } else if (collection === 'action_plans') {
                            conditions.push({ ...baseCondition, OR: [{ companyId: { in: companies } }, { company: { in: myCompanyNames, mode: 'insensitive' } }] });
                        } else if (collection === 'inspections') {
                            conditions.push({ ...baseCondition, OR: [{ companyId: { in: companies } }, { companyName: { in: myCompanyNames, mode: 'insensitive' } }] });
                        } else {
                            conditions.push({ ...baseCondition, companyId: { in: companies } });
                        }
                    } else {
                        // Last resort (riskier)
                        conditions.push(baseCondition);
                    }
                });
            }

            // Special case: Legacy Projects matched by Unit Name (if not already matched by ID)
            if (collection === 'projects' && myUnitNames.length > 0) {
                conditions.push({ unitName: { in: myUnitNames, mode: 'insensitive' } });
            }

            // Fallback: If no conditions were met, deny access, otherwise return OR
            if (conditions.length === 0) return { id: 'NOACCESS' }; 
            return { OR: conditions };
        }
        if (collection === 'sectors')   return sectors.length > 0 ? { id: { in: sectors } } : {};
        if (collection === 'locations') return locations.length > 0 ? { id: { in: locations } } : {};
        if (collection === 'units')     return units.length > 0 ? { id: { in: units } } : {};
        if (collection === 'companies') return companies.length > 0 ? { id: { in: companies } } : {};
        return {};
    }

    // Usuário Comum: Prioritizes unit-level filtering if specified, otherwise company-level
    if (collection === 'units') {
        if (units.length > 0) return { id: { in: units } };
        if (companies.length > 0) return { companyId: { in: companies } };
        return { id: 'NOACCESS' };
    }
    if (collection === 'companies') {
        return companies.length > 0 ? { id: { in: companies } } : { id: 'NOACCESS' };
    }
    
    if (['inspections', 'reports', 'weekly_reports', 'action_plans', 'sectors', 'locations', 'projects'].includes(collection)) {
        const myUnitNames: string[] = user.unitNames || [];
        const unitConditions: any[] = [];
        
        // 1. Filter by Unit ID if assigned
        if (units.length > 0) {
            unitConditions.push({ unitId: { in: units } });
        }
        
        // 2. Filter by Unit Name (Legacy Fallback)
        if (myUnitNames.length > 0) {
            const unitNameField = ['action_plans', 'weekly_reports', 'reports'].includes(collection) ? 'unit' : 'unitName';
            unitConditions.push({ [unitNameField]: { in: myUnitNames, mode: 'insensitive' } });
        }

        if (unitConditions.length > 0) {
            return { OR: unitConditions };
        }
        
        // 3. Fallback to Company if no units are specifically assigned
        if (companies.length > 0) {
            return { companyId: { in: companies } };
        }
        
        return { id: 'NOACCESS' };
    }

    if (['type_of_entries'].includes(collection)) return {};

    // Default fallback
    if (companies.length > 0) return { companyId: { in: companies } };
    return { id: 'NOACCESS' };
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login requests per `window`
    message: { error: 'Muitas tentativas de login a partir deste IP. Tente novamente após 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- AUTH middlewares ---
export const authenticate = (req: any, res: any, next: any) => {
    let token = req.headers.authorization?.split(' ')[1];
    
    // Fallback to query param token for images/media files
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) return res.status(401).json({ error: 'No token provided' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// --- AUTH ROUTES ---
router.post('/auth/login', loginLimiter, async (req: any, res: any) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }
        
        if (!user.status || user.status.toLowerCase() === 'pendente') {
            return res.status(403).json({ error: 'Sua conta ainda está pendente de aprovação pelo Administrador.' });
        }
        
        if (user.status?.toLowerCase() === 'negado' || user.blocked) {
            return res.status(403).json({ error: 'Seu acesso foi revogado ou negado. Contate o suporte.' });
        }
        
        // Fetch unit names for allowing legacy fallback (matching by name)
        let unitNames: string[] = [];
        let sectorNames: string[] = [];

        if (user.role === 'Gestor') {
            if (user.sectors && user.sectors.length > 0) {
                const assignedSectors = await prisma.sector.findMany({
                    where: { id: { in: user.sectors } },
                    select: { name: true, unitName: true }
                });
                sectorNames = [...new Set(assignedSectors.map(s => s.name.trim()))];
                unitNames = [...new Set(assignedSectors.map(s => s.unitName.trim()))];
            }
        }

        // Fetch Units if assigned directly to user (for any role)
        if (user.units && user.units.length > 0) {
            const assignedUnits = await prisma.unit.findMany({
                where: { id: { in: user.units } },
                select: { name: true }
            });
            unitNames = [...new Set([...unitNames, ...assignedUnits.map(u => u.name.trim())])];
        }

        // Fetch Company Names if assigned directly to user
        let companyNames: string[] = [];
        if (user.company) companyNames.push(user.company.trim());

        if (user.companies && user.companies.length > 0) {
            const assignedCompanies = await prisma.company.findMany({
                where: { id: { in: user.companies } },
                select: { name: true }
            });
            const dbNames = assignedCompanies.map(c => c.name.trim());
            companyNames = [...new Set([...companyNames, ...dbNames])];
        }

        const tokenData = { 
            id: user.id, 
            email: user.email, 
            displayName: user.displayName,
            role: user.role, 
            uid: user.uid,
            companies: user.companies || [],
            units: user.units || [],
            sectors: (user as any).sectors || [],
            locations: (user as any).locations || [],
            companyNames, // Include for legacy data filtering
            sectorNames, // Include for legacy data filtering
            unitNames // Include for legacy data filtering
        };
        const token = jwt.sign(tokenData, JWT_SECRET, { expiresIn: '7d' });
        
        await logAction(user, 'LOGIN', 'auth', 'Usuário realizou login com sucesso');

        // Remove password before sending
        const { password: _, ...userWithoutPass } = user;
        res.json({ user: userWithoutPass, token });
    } catch (e) {
        res.status(500).json({ error: 'Erro no login' });
    }
});

router.get('/auth/setup-master', async (req: any, res: any) => {
    try {
        // SECURITY: This endpoint is protected by a server-side secret.
        // Set SETUP_SECRET in your .env to enable this route.
        const setupSecret = process.env.SETUP_SECRET;
        if (!setupSecret) {
            return res.status(403).json({ error: 'Rota de setup desabilitada. Configure SETUP_SECRET no servidor para habilitar.' });
        }
        const providedSecret = req.headers['x-setup-secret'] || req.query.secret;
        if (providedSecret !== setupSecret) {
            return res.status(403).json({ error: 'Secret de setup inválido.' });
        }

        try {
            await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password" TEXT;`);
            await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "company" TEXT;`);
        } catch (dbError) {
            console.error("Auto-heal de colunas falhou (pode já estar atualizado):", dbError);
        }

        const hashedPassword = await bcrypt.hash('nova@2026', 10);
        const user = await prisma.user.upsert({
            where: { email: 'daniel-ehs@outlook.com' },
            update: { password: hashedPassword, role: 'Master', status: 'Aprovado', displayName: 'Daniel (Master)' },
            create: { email: 'daniel-ehs@outlook.com', password: hashedPassword, role: 'Master', status: 'Aprovado', displayName: 'Daniel (Master)', uid: 'MASTER_' + Date.now(), company: 'Todas' }
        });
        res.json({ message: 'Master user created/updated successfully', email: user.email });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

router.post('/auth/register', async (req: any, res: any) => {
    const { email, password, name, role, company } = req.body;
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ error: 'Email já em uso ou cadastrado' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const uid = Date.now().toString(); // Simulating Firebase UID

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                displayName: name,
                role: role || 'Usuário Comum',
                company: company || '',
                status: 'Pendente',
                uid

            }
        });
        
        const adminEmail = process.env.ADMIN_EMAIL || 'daniel-ehs@outlook.com';
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        
        const adminHtml = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; text-align: center;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <div style="background-color: #D32F2F; padding: 30px 20px;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px;">InspecPRO</h1>
                        <p style="color: #ffebee; margin: 10px 0 0 0; font-size: 16px;">Sistema de Gestão de Segurança</p>
                    </div>
                    <div style="padding: 40px 30px; text-align: left;">
                        <h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid #eeeeee; padding-bottom: 10px;">Nova Solicitação de Acesso</h2>
                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                            Um novo usuário solicitou acesso ao sistema. Verifique as informações abaixo:
                        </p>
                        <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; border-left: 4px solid #D32F2F; margin-bottom: 30px;">
                            <p style="margin: 5px 0;"><strong>Nome:</strong> <span style="color: #333;">${name}</span></p>
                            <p style="margin: 5px 0;"><strong>E-mail:</strong> <span style="color: #333;">${email}</span></p>
                            <p style="margin: 5px 0;"><strong>Empresa:</strong> <span style="color: #333;">${company || 'Não informada'}</span></p>
                        </div>
                        <p style="color: #555555; font-size: 15px;">
                            Acesse o painel do administrador para aprovar ou rejeitar a liberação de acesso deste usuário.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        const emailSent = await sendEmail(adminEmail, 'Nova Solicitação de Acesso - InspecPro', 'Novo acesso solicitado por ' + email, adminHtml);
        if (emailSent) {
            await logAction(null, 'EMAIL_SENT', 'auth', `Notificação de nova solicitação de acesso (${email}) enviada para admin.`);
        }
        
        // Return 201 without logging them in immediately (no JWT token), since they must wait for approval.
        res.status(201).json({ message: 'Solicitação enviada para aprovação' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao registrar a solicitação', details: String(e) });
    }
});

router.post('/auth/forgot-password', async (req: any, res: any) => {
    const { email, isNewUser } = req.body;
    try {
        const emailToSearch = email.trim();
        const user = await prisma.user.findFirst({ 
            where: { email: { equals: emailToSearch, mode: 'insensitive' } } 
        });
        if (!user) {
            return res.status(400).json({ error: 'E-mail não encontrado na nossa base de dados.' });
        }
        
        const resetToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        const baseUrl = process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br';
        const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
        
        const logoHtml = `<img src="${baseUrl}/logos/logocompleto.png" alt="InspecPRO" style="height: 48px; object-fit: contain; margin-bottom: 5px;" onerror="this.outerHTML='<h1 style=\\'color: #27AE60; margin: 0; font-size: 28px; letter-spacing: 1px;\\'>InspecPRO</h1>'" />`;

        const title = isNewUser ? 'Bem-vindo(a) ao InspecPRO' : 'Recuperação de Senha';
        const subtitle = isNewUser ? 'Seu acesso foi liberado' : 'Solicitação de redefinição';
        const buttonText = isNewUser ? 'Criar minha Senha' : 'Redefinir minha Senha';
        
        const textContent = isNewUser
            ? `Olá, <strong>${user.displayName || 'Usuário'}</strong>.<br><br>Sua conta no InspecPRO foi criada e seu acesso está liberado! Estamos muito felizes em ter você aqui.<br><br>Para começar a utilizar o sistema, por favor, clique no botão abaixo para criar a sua senha de acesso exclusiva e segura.`
            : `Olá, <strong>${user.displayName || 'Usuário'}</strong>.<br><br>Recebemos uma solicitação para redefinir a sua senha de acesso ao sistema InspecPRO.<br><br>Se foi você quem fez esta solicitação, clique no botão abaixo para criar uma senha nova. Caso contrário, você pode ignorar este e-mail tranquilamente.`;

        const html = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; text-align: center;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <div style="background-color: #ffffff; border-bottom: 3px solid #27AE60; padding: 30px 20px;">
                        ${logoHtml}
                        <p style="color: #555555; margin: 10px 0 0 0; font-size: 16px; font-weight: 500;">Sistema de Gestão de Segurança</p>
                    </div>
                    <div style="padding: 40px 30px; text-align: left;">
                        <h2 style="color: #2c3e50; margin-top: 0;">${title}</h2>
                        <h4 style="color: #27AE60; margin-top: -10px; margin-bottom: 20px; font-weight: 500;">${subtitle}</h4>
                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                            ${textContent}
                        </p>
                        <div style="text-align: center; margin-bottom: 30px;">
                            <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background-color: #27AE60; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; transition: background-color 0.3s; box-shadow: 0 4px 6px rgba(39, 174, 96, 0.2);">${buttonText}</a>
                        </div>
                        <p style="color: #999999; font-size: 13px; border-top: 1px solid #eeeeee; padding-top: 20px; text-align: center;">
                            Este link expirará em 1 hora por motivos de segurança.<br>Dúvidas? Entre em contato com o administrador do seu sistema.
                        </p>
                    </div>
                </div>
                <div style="color: #aaaaaa; font-size: 12px; margin-top: 20px;">
                    &copy; ${new Date().getFullYear()} InspecPRO. Todos os direitos reservados.
                </div>
            </div>
        `;
        
        const subject = isNewUser ? 'Bem-vindo(a) ao InspecPRO! Crie sua Senha' : 'Recuperação de Senha - InspecPro';
        const snippetText = isNewUser ? 'Acesse o link para criar sua senha de acesso.' : 'Acesse o link para recuperar sua senha.';

        const emailSent = await sendEmail(email, subject, snippetText + ' Link: ' + resetLink, html);
        if (emailSent) {
            await logAction(null, 'EMAIL_SENT', 'auth', `E-mail de ${subject} enviado para: ${email}`);
        }
        res.json({ message: 'Se o e-mail existir, você receberá um link de acesso' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao processar o e-mail' });
    }
});

router.post('/auth/reset-password', async (req: any, res: any) => {
    const { token, newPassword } = req.body;
    try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });
        
        res.json({ message: 'Senha atualizada com sucesso!' });
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: 'Token inválido ou expirado.' });
    }
});

router.get('/auth/verify-token', async (req: any, res: any) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token ausente.' });
    try {
        jwt.verify(token, JWT_SECRET);
        res.json({ valid: true });
    } catch (e) {
        res.status(400).json({ error: 'Token inválido ou expirado.' });
    }
});


router.get('/auth/me', authenticate, async (req: any, res: any) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (user) {
            const { password: _, ...userWithoutPass } = user;
            res.json(userWithoutPass);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Error fetching user' });
    }
});

// --- AI CORRECTION ROUTE ---
router.post('/gemini/correct', authenticate, async (req: any, res: any) => {
    try {
        const { field, text, context, module } = req.body;
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        
        let systemInstruction = "Você é um especialista em Segurança do Trabalho (EHS). Sua tarefa é fornecer APENAS o texto corrigido e refinado tecnicamente, de forma direta e sucinta. NÃO inclua introduções, explicações, aspas, sugestões ou ideias adicionais. NÃO adicione informações que não foram fornecidas pelo usuário. O resultado deve ser estritamente o texto final pronto para uso, mantendo a relação direta com o que o usuário digitou.";
        
        if (module === 'projects') {
            systemInstruction = "Você é um especialista em Gestão de Projetos de Segurança do Trabalho (EHS). Sua missão é refinar textos para novos projetos de segurança a serem implementados. O texto deve ser profissional, coerente, fluído, sem erros gramaticais e tecnicamente preciso para um contexto executivo/corporativo de EHS. Retorne APENAS o texto final pronto.";
        }

        let prompt = "";

        switch (field) {
          case 'apontamento':
            prompt = `Refine o seguinte apontamento de segurança, focando estritamente no objeto e na irregularidade encontrada: "${text}". Retorne apenas o texto técnico final e direto.`;
            break;
          case 'risco':
            prompt = `Considerando o apontamento "${context.apontamento || ''}", refine tecnicamente o risco/consequência digitado pelo usuário: "${text}". Retorne apenas o texto técnico final, curto e direto, sem exageros.`;
            break;
          case 'resolucao':
            prompt = `Considerando o apontamento "${context.apontamento || ''}" e o risco "${context.risco || ''}", refine tecnicamente a resolução digitada pelo usuário: "${text}". Retorne apenas o texto técnico final, curto e direto, descrevendo a ação tomada.`;
            break;
          case 'observacoes':
          case 'observations':
            prompt = `Refine tecnicamente as seguintes observações: "${text}". Retorne apenas o texto final direto.`;
            break;
          case 'description':
            prompt = `Refine a descrição deste projeto de segurança: "${text}". O texto deve ser claro, profissional e focado no escopo técnico.`;
            break;
        }

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.4,
          },
        });

        res.json({ correctedText: response.text?.trim() || text });
    } catch (e: any) {
        console.error("Erro Gemini:", e);
        res.status(500).json({ error: "Erro ao gerar correção", details: e.message });
    }
});

// --- GENERIC CRUD ROUTES FOR MIGRATING FROM FIREBASE TO POSTGRESQL ---
// Map the frontend collection names to Prisma model names
const prismaModels: Record<string, keyof typeof prisma> = {
    'users': 'user',
    'companies': 'company',
    'units': 'unit',
    'sectors': 'sector',
    'locations': 'location',
    'inspections': 'inspection',
    'reports': 'report',
    'weekly_reports': 'weeklyReport',
    'action_plans': 'actionPlan',
    'projects': 'project',
    'type_of_entries': 'typeOfEntry',
    'report_templates': 'reportTemplate',
    'system_logs': 'systemLog'
};

// Mapping of collections that have files in MinIO to their field and bucket
const collectionFileMappers: Record<string, { field: string, bucket: string }> = {
    'weekly_reports': { field: 'pdfUrl', bucket: BUCKETS.RELATORIO_PDF },
    'inspections': { field: 'image', bucket: BUCKETS.FOTO_INSPECAO },
    'action_plans': { field: 'photoAfter', bucket: BUCKETS.FOTO_PLANODEACAO },
    'companies': { field: 'logo', bucket: BUCKETS.LOGO_EMPRESA },
    'projects': { field: 'image', bucket: BUCKETS.FOTO_PROJETO },
    'report_templates': { field: 'minioUrl', bucket: BUCKETS.MODELOS_RELATORIOS }
};

// GET all items from a collection
router.get('/data/:collection', authenticate, async (req: any, res: any) => {
    try {
        const { collection } = req.params;
        const modelName = prismaModels[collection];
        if (!modelName) return res.status(400).json({ error: 'Collection not mapped securely.' });

        const model = prisma[modelName] as any;
        const filter = await getTenantFilter(req.user, collection);
        const items = await model.findMany({ 
            where: filter,
            orderBy: { createdAt: 'desc' } 
        });
        res.json(items);
    } catch (e: any) {
        console.error(`Error GET /data/${req.params.collection}:`, e);
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
});

// GET one item
router.get('/data/:collection/:id', authenticate, async (req: any, res: any) => {
    try {
        const { collection, id } = req.params;
        const modelName = prismaModels[collection];
        if (!modelName) return res.status(400).json({ error: 'Collection not mapped securely.' });

        const model = prisma[modelName] as any;
        const tenantFilter = await getTenantFilter(req.user, collection);
        const filter = Object.keys(tenantFilter).length > 0 ? { AND: [{ id }, tenantFilter] } : { id };
        const item = await model.findFirst({ where: filter });
        if (!item) return res.status(403).json({ error: 'Acesso negado ou registro não encontrado.' });
        res.json(item);
    } catch (e: any) {
        console.error(`Error GET /data/${req.params.collection}/${req.params.id}:`, e);
        res.status(500).json({ error: 'Erro ao buscar documento' });
    }
});

// CREATE item
router.post('/data/:collection', authenticate, async (req: any, res: any) => {
    try {
        const { collection } = req.params;
        const modelName = prismaModels[collection];
        if (!modelName) return res.status(400).json({ error: 'Collection not mapped securely.' });

        // Clean data for Prisma (remove nested objects if they clash, etc.)
        const data = req.body;
        delete data.createdAt;
        delete data.updatedAt;
        delete data.timestamp;

        const model = prisma[modelName] as any;
        const created = await model.create({ data });

        // If a new inspection is created, notify the responsible sector manager (Gestor) and Administrators
        if (collection === 'inspections') {
            try {
                // Run email sending in background to avoid delaying the response
                (async () => {
                    // Separa a lógica: Administrador recebe se for da empresa; Gestor se for do setor.
                    const orConditions: any[] = [{ role: 'Master' }];
                    
                    let targetAdminCompanyId = created.companyId;
                    if (!targetAdminCompanyId && created.company) {
                        const matchedComp = await prisma.company.findFirst({ where: { name: created.company } });
                        if (matchedComp) targetAdminCompanyId = matchedComp.id;
                    }
                    if (targetAdminCompanyId) {
                        orConditions.push({ role: 'Administrador', companies: { has: targetAdminCompanyId } });
                    }

                    const gestorAnd: any = { role: 'Gestor' };
                    let hasGestorCondition = false;
                    if (created.sectorId) { gestorAnd.sectors = { has: created.sectorId }; hasGestorCondition = true; }
                    if (created.locationId) { gestorAnd.locations = { has: created.locationId }; hasGestorCondition = true; }
                    
                    if (hasGestorCondition) {
                        orConditions.push(gestorAnd);
                    }

                    // Fetch users with role Gestor or Administrador that are approved and not blocked
                    const managers = await prisma.user.findMany({
                        where: {
                            blocked: false,
                            status: 'Aprovado',
                            OR: orConditions
                        }
                    });

                    const validManagers = managers.filter(u => u.email);
                    if (validManagers.length === 0) return; // No recipients, exit silently

                    // Generate PDF of the inspection
                    const pdfBuffer = await LegacyReportService.generateInspectionFindingPDF(created.id);

                    // Basic colors
                    let hexColor = '#F39C12'; // orange accent
                    let bgColor = '#fdfaf3';

                    for (const manager of validManagers) {
                        const firstName = manager.displayName ? manager.displayName.split(' ')[0] : 'Gestor';

                        const isGestor = manager.role === 'Gestor';
                        const bodyIntro = isGestor
                            ? `Foi incluída uma nova inspeção no setor do qual você é responsável: <strong>${created.sectorName || created.sectorId}</strong>.`
                            : `Para o seu conhecimento, foi registrada uma nova inspeção no setor <strong>${created.sectorName || created.sectorId}</strong>. O Gestor desta área já foi notificado.`;

                        const closingAction = isGestor
                            ? `<p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                    <strong>Ação de Fechamento Necessária:</strong><br/>
                                    Para fechar essa inspeção, você deve acessar o sistema e <strong>criar o plano de ação</strong> indicando a resolução e os prazos.
                               </p>`
                            : `<p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                    Como Administrador, você não precisará fechar o apontamento, mas pode acompanhar a criação do Plano de Ação pela equipe responsável diretamente em seu painel.
                               </p>`;

                        const emailHtml = `
                            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; text-align: center;">
                                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                                    <div style="background-color: #ffffff; border-bottom: 3px solid ${hexColor}; padding: 30px 20px;">
                                        <img src="${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}/logos/logocompleto.png" alt="InspecPRO" style="height: 48px; object-fit: contain; margin-bottom: 5px;" onerror="this.outerHTML='<h1 style=\\'color: ${hexColor}; margin: 0; font-size: 28px; letter-spacing: 1px;\\'>InspecPRO</h1>'" />
                                        <p style="color: #555555; margin: 5px 0 0 0; font-size: 16px; font-weight: 500;">🚨 Nova Inspeção Registrada</p>
                                    </div>
                                    <div style="padding: 40px 30px; text-align: left;">
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Olá <strong>${firstName}</strong>,</p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            ${bodyIntro}
                                        </p>
                                        <div style="padding: 15px; background-color: ${bgColor}; border-left: 4px solid ${hexColor}; border-radius: 4px; margin-bottom: 20px;">
                                            <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0;"><strong>Detalhes da Inspeção:</strong></p>
                                            <p style="color: #555555; font-size: 14px; line-height: 1.6; margin: 8px 0 0 0;">${created.description || 'Descrição indisponível.'}</p>
                                            <p style="color: ${hexColor}; font-size: 12px; margin-top: 10px; font-weight: bold;">Local: ${created.locationName || created.locationId || 'Geral'} | Tipo: ${created.type || 'Não especificado'}</p>
                                        </div>
                                        ${closingAction}
                                        <div style="text-align: center; margin: 30px 0;">
                                            <a href="${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}" style="display: inline-block; padding: 14px 28px; background-color: #27AE60; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; border: none; cursor: pointer;">
                                                Acessar Sistema InspecPRO
                                            </a>
                                        </div>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Atenciosamente,<br/><strong>Equipe InspecPRO</strong>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        `;

                        const emailSent = await sendEmail(
                            manager.email as string,
                            `🔔 Nova Inspeção no Setor: ${created.sectorName || 'Seu Setor'}`,
                            `Uma nova inspeção foi registrada e requer sua atenção.`,
                            emailHtml,
                            [{ filename: `Inspecao_${created.id.substring(0, 8)}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
                        );

                        if (emailSent) {
                            await logAction(req.user, 'EMAIL_SENT', 'inspections', `Notificação de nova inspeção enviada para: ${manager.email}`);
                        }
                    }
                })().catch(err => console.error('Erro ao enviar e‑mail de inspeção:', err));
            } catch (automationErr) {
                console.error('Erro ao iniciar automação de e‑mail de inspeção:', automationErr);
            }
        }

        const friendlyLabel = await getFriendlyLabel(collection, created.id, created);
        await logAction(req.user, 'CREATE', collection, `Criou ${friendlyLabel}`);

        res.status(201).json(created);
    } catch (e: any) {
        console.error(`Error POST /data/${req.params.collection}:`, e);
        res.status(500).json({ error: 'Erro ao criar documento' });
    }
});

// UPDATE item
router.put('/data/:collection/:id', authenticate, async (req: any, res: any) => {
    try {
        const { collection, id } = req.params;
        const modelName = prismaModels[collection];
        if (!modelName) return res.status(400).json({ error: 'Collection not mapped securely.' });

        const data = req.body;
        delete data.id;
        delete data.createdAt;
        delete data.updatedAt;
        delete data.timestamp;

        const model = prisma[modelName] as any;
        const tenantFilter = await getTenantFilter(req.user, collection);
        const filter = Object.keys(tenantFilter).length > 0 ? { AND: [{ id }, tenantFilter] } : { id };
        
        // Final check: regular users can't edit companies or other users unless they are Master/Admin
        if (['companies', 'users'].includes(collection) && req.user.role !== 'Master') {
            if (req.user.role !== 'Administrador') {
                return res.status(403).json({ error: 'Permissão insuficiente.' });
            }
        }

        const updated = await model.updateMany({ where: filter, data });
        if (updated.count === 0) return res.status(403).json({ error: 'Acesso negado ou registro não encontrado.' });

        const updatedRecord = await model.findFirst({ where: { id } }).catch(() => null);
        const friendlyLabel = await getFriendlyLabel(collection, id, updatedRecord || data);
        await logAction(req.user, 'UPDATE', collection, `Atualizou ${friendlyLabel}`);
        
        res.json({ success: true, count: updated.count });
    } catch (e: any) {
        console.error(`Error PUT /data/${req.params.collection}/${req.params.id}:`, e);
        res.status(500).json({ error: 'Erro ao atualizar documento' });
    }
});

// DELETE item
router.delete('/data/:collection/:id', authenticate, async (req: any, res: any) => {
    try {
        const { collection, id } = req.params;
        const modelName = prismaModels[collection];
        if (!modelName) return res.status(400).json({ error: 'Collection not mapped securely.' });

        const model = prisma[modelName] as any;
        const tenantFilter = await getTenantFilter(req.user, collection);
        const filter = Object.keys(tenantFilter).length > 0 ? { AND: [{ id }, tenantFilter] } : { id };

        if (['companies', 'users'].includes(collection) && req.user.role !== 'Master') {
            return res.status(403).json({ error: 'Apenas usuários Master podem excluir estes registros.' });
        }

        // PHYSICAL FILE CLEANUP (MinIO/S3)
        const fileMapper = collectionFileMappers[collection];
        if (fileMapper) {
            try {
                const record = await model.findFirst({ where: filter });
                if (record && record[fileMapper.field]) {
                    const fileUrl = record[fileMapper.field];
                    // Extract filename from URL (e.g. /api/files/bucket/filename.jpg -> filename.jpg)
                    const filename = fileUrl.split('/').pop();
                    
                    if (filename && !filename.startsWith('http')) { // Only delete if it's an internal proxy URL
                         const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
                         await s3.send(new DeleteObjectCommand({
                             Bucket: fileMapper.bucket,
                             Key: filename
                         }));
                         console.log(`[MINIO CLEANUP] Arquivo deletado do bucket ${fileMapper.bucket}: ${filename}`);
                    }
                }
            } catch (s3Error) {
                console.error('[MINIO CLEANUP ERROR]: Erro ao tentar remover arquivo físico:', s3Error);
            }
        }

        // Fetch record BEFORE deleting for the label
        const recordToDelete = await model.findFirst({ where: { id } }).catch(() => null);
        const deleted = await model.deleteMany({ where: filter });
        if (deleted.count === 0) return res.status(403).json({ error: 'Acesso negado ou registro não encontrado.' });

        const friendlyLabel = await getFriendlyLabel(collection, id, recordToDelete);
        await logAction(req.user, 'DELETE', collection, `Removeu ${friendlyLabel}`);

        res.json({ success: true, message: 'Deletado com sucesso' });
    } catch (e: any) {
        console.error(`Error DELETE /data/${req.params.collection}/${req.params.id}:`, e);
        res.status(500).json({ error: 'Erro ao deletar documento' });
    }
});

import { upload, uploadToS3, BUCKETS, s3 } from './s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';

// --- FILE PROXY ROUTE to bypass internal Minio hostnames ---
router.get('/files/:bucket/:filename', authenticate, async (req: any, res: any) => {
    try {
        const command = new GetObjectCommand({
            Bucket: req.params.bucket,
            Key: req.params.filename,
        });
        const s3Response = await s3.send(command);
        const mimeType = s3Response.ContentType || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        
        // Pipe the readable stream dynamically to the response
        if (s3Response.Body && (s3Response.Body as any).pipe) {
            (s3Response.Body as any).pipe(res);
        } else {
            // Fallback for stream reading
            const stream = s3Response.Body as any;
            for await (const chunk of stream) {
                res.write(chunk);
            }
            res.end();
        }
    } catch (e: any) {
        console.error('Erro ao buscar arquivo do Minio:', e);
        res.status(404).json({ error: 'File not found' });
    }
});

// --- UPLOAD ROUTE ---
router.post('/upload', authenticate, upload.single('file'), async (req: any, res: any) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }
        
        const { bucket } = req.body;
        
        // Verifica se o bucket passado é um dos nossos buckets registrados
        const validBuckets = Object.values(BUCKETS);
        const destinationBucket = validBuckets.includes(bucket) ? bucket : BUCKETS.FOTO_INSPECAO;

        const fileName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '')}`;
        
        const fileUrl = await uploadToS3(req.file.buffer, fileName, req.file.mimetype, destinationBucket);
        
        res.json({ url: fileUrl });
    } catch (e: any) {
        console.error('Erro no upload para S3:', e);
        res.status(500).json({ error: 'Erro no upload do arquivo' });
    }
});

// --- PUBLIC UPLOAD ROUTE (for anonymous reports only) ---
router.post('/public-upload', upload.single('file'), async (req: any, res: any) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }

        // SECURITY: Strict MIME type whitelist — only images allowed on public route
        const allowedPublicMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedPublicMimes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Apenas imagens (JPG, PNG, WEBP) são permitidas nesta rota.' });
        }

        // SECURITY: Size limit for public uploads (10MB max)
        const MAX_PUBLIC_SIZE = 10 * 1024 * 1024; // 10MB
        if (req.file.size > MAX_PUBLIC_SIZE) {
            return res.status(400).json({ error: 'Arquivo muito grande. Máximo permitido: 10MB.' });
        }

        // Force FOTO_INSPECAO bucket for public uploads
        const destinationBucket = BUCKETS.FOTO_INSPECAO;
        const fileName = `anon_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '')}`;
        const fileUrl = await uploadToS3(req.file.buffer, fileName, req.file.mimetype, destinationBucket);

        res.json({ url: fileUrl });
    } catch (e: any) {
        console.error('Erro no upload público para S3:', e);
        res.status(500).json({ error: 'Erro no upload do arquivo' });
    }
});

// --- PUBLIC STATS (no auth required) ---
router.get('/public-stats', async (req: any, res: any) => {
    try {
        const year = parseInt(String(req.query.year)) || 0;
        const month = parseInt(String(req.query.month)) || 0;

        const typeFilter = {
            OR: [
                { type: { contains: 'Potencial', mode: 'insensitive' } },
                { type: { contains: 'Potêncial', mode: 'insensitive' } }
            ]
        };

        let inspectionWhere: any = { ...typeFilter };
        let projectWhere: any = {};

        if (year > 0) {
            const yearStart = new Date(year, 0, 1);
            const yearEnd   = new Date(year + 1, 0, 1);
            const dateFilter = { gte: yearStart, lt: yearEnd };
            inspectionWhere.createdAt = dateFilter;
            projectWhere.createdAt = dateFilter;
        }

        // Count inspections in the year (or total if year=0)
        const yearCount = await prisma.inspection.count({
            where: inspectionWhere
        });

        // Count inspections in the specific period (month or whole year)
        let periodCount = yearCount;
        if (year > 0 && month > 0) {
            const periodStart = new Date(year, month - 1, 1);
            const periodEnd   = new Date(year, month, 1);
            periodCount = await prisma.inspection.count({
                where: { 
                    ...typeFilter,
                    createdAt: { gte: periodStart, lt: periodEnd } 
                }
            });
        }

        // Count projects (any status)
        const projectCount = await prisma.project.count({
            where: projectWhere
        });

        res.json({ periodCount, yearCount, projectCount });
    } catch (e: any) {
        console.error('Erro ao buscar estatísticas públicas:', e);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// --- PUBLIC REPORT ROUTE ---
router.post('/public-report', async (req: any, res: any) => {
    try {
        const data = req.body;
        delete data.createdAt;
        delete data.updatedAt;
        delete data.timestamp;

        const created = await prisma.report.create({
            data: {
                ...data,
                status: 'Pendente'
            }
        });
        res.status(201).json(created);
    } catch (e: any) {
        console.error('Erro ao criar relato anônimo:', e);
        res.status(500).json({ error: 'Erro ao enviar o relato', details: String(e) });
    }
});


import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import libre from 'libreoffice-convert';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const docxConvert = promisify(libre.convert);

const getMediaUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000';
    const cleanPath = path.includes('/') ? path.split('/').pop() : path;
    return `${apiUrl}/api/files/inspections/${cleanPath}`;
};

// Helper (handles relative /api/files/ URLs by fetching directly from S3)
const getInternalFileBuffer = async (url: string) => {
    try {
        if (!url) return null;
        console.log('Fetching internal buffer for:', url);
        if (url.includes('/api/files/')) {
            const parts = url.split('/');
            // Expecting .../api/files/bucketname/filename
            const bucketIndex = parts.indexOf('files') + 1;
            if (bucketIndex > 0 && bucketIndex < parts.length) {
                const bucket = parts[bucketIndex];
                const key = parts.slice(bucketIndex + 1).join('/');
                console.log('S3 Direct Fetch:', bucket, key);
                const command = new GetObjectCommand({ Bucket: bucket, Key: key });
                const s3Response = await s3.send(command).catch(err => {
                    console.warn(`S3 Error for ${bucket}/${key}:`, err.message);
                    return null;
                });
                if (!s3Response || !s3Response.Body) return null;
                const chunks = [];
                for await (const chunk of s3Response.Body as any) { chunks.push(chunk); }
                return Buffer.concat(chunks);
            }
        }
        
        const resp = await fetch(url).catch(e => {
            console.warn('Fetch failed for:', url, e.message);
            return null;
        });
        if (!resp || !resp.ok) return null;
        return Buffer.from(await resp.arrayBuffer());
    } catch (e) {
        console.error('Erro ao buscar arquivo:', url, e);
        return null;
    }
};

const getImageBuffer = async (url: string) => {
    return getInternalFileBuffer(url);
};

// --- RELATÓRIO V11 (PHP-STYLE MANUALLY DRAWN) ROUTE ---
router.post('/reports/generate-v11', authenticate, async (req: any, res: any) => {
    try {
        const { groups, week, year, filename } = req.body;
        
        await logAction(req.user, 'REPORT_GEN', 'reports', `Gerou relatório manual: ${filename || ''} (Sem ${week}/${year})`);
        // groups: Record<string, Inspection[]>
        
        const pdfDoc = await PDFDocument.create();
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const formatDate = (dateStr: string) => {
            if (!dateStr) return '---';
            try { return new Date(dateStr).toLocaleDateString('pt-BR'); } catch { return dateStr; }
        };

        const addFooter = (page: any, pageNum: number) => {
             const footerText = `Relatório Semanal de EHS - Semana ${week}/${year} - Página ${pageNum}`;
             page.drawText(footerText, {
                 x: 40,
                 y: 20,
                 size: 8,
                 font: fontRegular,
                 color: rgb(0.4, 0.4, 0.4)
             });
        };

        let currentPageNum = 1;
        const entries = Object.entries(groups || {});

        for (const [groupKey, inspections] of entries as any) {
            const [sectorName, localName] = groupKey.split(' | ');

            // 1. CAPA DO GRUPO (Cover)
            const coverPage = pdfDoc.addPage([842, 595]); // A4 Landscape (pt)
            // Background Light Green/Blue
            coverPage.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.95, 0.98, 0.96) });
            
            coverPage.drawText(sectorName, {
                x: 421 - (fontBold.widthOfTextAtSize(sectorName, 35) / 2),
                y: 300,
                size: 35,
                font: fontBold,
                color: rgb(0, 0.33, 0.58)
            });
            coverPage.drawText(localName, {
                x: 421 - (fontRegular.widthOfTextAtSize(localName, 24) / 2),
                y: 260,
                size: 24,
                font: fontRegular,
                color: rgb(0.4, 0.4, 0.4)
            });
            currentPageNum++;

            // 2. APONTAMENTOS (Findings)
            for (const insp of inspections as any) {
                const page = pdfDoc.addPage([842, 595]);
                
                // Image Column (Left)
                const photoBuffer = await getImageBuffer(getMediaUrl(insp.image));
                if (photoBuffer) {
                   try {
                     const img = await pdfDoc.embedJpg(photoBuffer).catch(() => pdfDoc.embedPng(photoBuffer));
                     page.drawImage(img, {
                        x: 80, y: 120, width: 330, height: 400
                     });
                   } catch(e) { console.error('PDF v11 image error:', e); }
                }

                // Data Column (Right)
                const xDados = 480;
                let yPos = 480;

                const drawField = (label: string, text: string, color = rgb(0, 0.33, 0.58)) => {
                    page.drawText(label, { x: xDados, y: yPos, size: 12, font: fontBold, color });
                    yPos -= 20;
                    const cleanText = text || 'Não informado';
                    const words = cleanText.split(' ');
                    let line = '';
                    for (const word of words) {
                        if (fontRegular.widthOfTextAtSize(line + word, 10) < 300) {
                           line += word + ' ';
                        } else {
                           page.drawText(line, { x: xDados, y: yPos, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
                           yPos -= 12;
                           line = word + ' ';
                        }
                    }
                    page.drawText(line, { x: xDados, y: yPos, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
                    yPos -= 30;
                };

                drawField('Apontamento:', insp.description);
                drawField('Risco/Consequência:', insp.risk, rgb(0.8, 0, 0));
                drawField('Resolução:', insp.resolution);
                drawField('Responsável/Prazo:', `${insp.responsible || 'N/A'} - ${formatDate(insp.deadline)}`);

                // Stamp
                if (insp.status === 'Concluído') {
                    page.drawRectangle({ x: xDados, y: 80, width: 150, height: 35, color: rgb(0.15, 0.68, 0.37) });
                    page.drawText('CONCLUÍDO', { x: xDados + 25, y: 92, size: 14, font: fontBold, color: rgb(1, 1, 1) });
                }

                addFooter(page, currentPageNum);
                currentPageNum++;
            }
        }

        const finalPdfBuffer = Buffer.from(await pdfDoc.save());
        const finalFilename = `${filename || 'relatorio_v11'}_${Date.now()}.pdf`;
        const pdfUrl = await uploadToS3(finalPdfBuffer, finalFilename, 'application/pdf', BUCKETS.RELATORIO_PDF);

        res.json({ url: pdfUrl });

    } catch (e: any) {
        console.error('Erro na geração v11:', e);
        res.status(500).json({ error: 'Erro ao processar relatório V11', details: String(e) });
    }
});

// --- BULK PPTX to PDF CONVERSION ROUTE ---
router.post('/reports/generate-bulk-pdf', authenticate, async (req: any, res: any) => {
    try {
        const { pages, filename } = req.body;
        if (!pages || !Array.isArray(pages)) return res.status(400).json({ error: 'Nenhuma página enviada.' });

        const pdfBuffers: Buffer[] = [];

        for (const page of pages) {
            const { templateUrl, data } = page;
            
            // 1. Download template (using internal helper)
            const templateBuffer = await getInternalFileBuffer(templateUrl);
            if (!templateBuffer) continue;

            // 2. Prepare Image Module
            const imageOptions = {
                centered: false,
                getImage(tagValue: string) {
                    // This will be called for tags like {%inspection_photo}
                    // It expects a buffer. We'll pre-fetch it or handle it here.
                    return tagValue; // tagValue should be the buffer (passed in doc.setData)
                },
                getSize() {
                    return [400, 300]; // Default size for findings
                }
            };
            const imageModule = new ImageModule(imageOptions);

            // 3. Fill Template
            const zip = new PizZip(templateBuffer);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                modules: [imageModule]
            });

            // FETCH IMAGE BUFFERS
            // (Note: docxtemplater-image-module-free needs the buffer in the data object)
            const photoFields = ['inspection_photo', 'photo_before', 'photo_after', 'status_photo', 'company_logo'];
            for (const field of photoFields) {
               if (data[field] && typeof data[field] === 'string' && (data[field].startsWith('http') || data[field].startsWith('/api/'))) {
                  const photoBuffer = await getImageBuffer(data[field]);
                  if (photoBuffer) data[field] = photoBuffer;
               }
            }

            doc.setData(data);
            doc.render();

            const filledPptxBuffer = doc.getZip().generate({ type: 'nodebuffer' });

            // 4. Convert PPTX to PDF
            const pdfBuffer = await docxConvert(filledPptxBuffer, '.pdf', undefined);
            pdfBuffers.push(pdfBuffer as Buffer);
        }

        // 5. Merge all PDFs using pdf-lib
        const mergedPdf = await PDFDocument.create();
        for (const buffer of pdfBuffers) {
            const pdfDoc = await PDFDocument.load(buffer);
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((p) => mergedPdf.addPage(p));
        }

        const finalPdfBuffer = Buffer.from(await mergedPdf.save());

        // 6. Upload final PDF to S3
        const finalFilename = `${filename || 'relatorio'}_${Date.now()}.pdf`;
        const pdfUrl = await uploadToS3(finalPdfBuffer, finalFilename, 'application/pdf', BUCKETS.RELATORIO_PDF);

        res.json({ url: pdfUrl });

    } catch (e: any) {
        console.error('Erro na geração do relatório em massa:', e);
        res.status(500).json({ error: 'Erro ao processar o relatório final', details: String(e) });
    }
});

import { LegacyReportService } from './reports/LegacyReportService';

// --- LEGACY REPORTS ROUTES (PHP-STYLE) ---
router.post('/reports/legacy/weekly', authenticate, async (req: any, res: any) => {
    try {
        const { week, year, companyId, unitId } = req.body;

        // SECURITY: Verify tenant access - user must have access to the requested company/unit
        if (req.user.role !== 'Master') {
            const userCompanies: string[] = req.user.companies || [];
            const userUnits: string[] = req.user.units || [];
            const userUnitNames: string[] = req.user.unitNames || [];

            let allowed = false;
            if (companyId && userCompanies.includes(companyId)) {
                allowed = true;
            } else if (unitId && userUnits.includes(unitId)) {
                allowed = true;
            } else if (unitId) {
                // If unitId is present but not in userUnits, check if it's one of their companies
                // This logic depend on unit's company, for now we skip OR strict check
            }
            
            // If the weekly report was requested by ID but user only has access to unit names
            // This is harder to verify weekly because weekly report is not a single unit always
            // But we can check if they have access to the companyId at least.

            if (req.user.role !== 'Administrador' && unitId && !userUnits.includes(unitId)) {
                // Check if they have access to this unit by name (legacy)
                // This requires fetching the requested unit name
                const requestedUnit = await prisma.unit.findUnique({ where: { id: unitId } });
                if (requestedUnit && !userUnitNames.some(un => un.toLowerCase() === requestedUnit.name.toLowerCase())) {
                    return res.status(403).json({ error: 'Acesso negado: você não tem permissão para gerar relatórios desta unidade.' });
                }
            } else if (!companyId && !unitId) {
                return res.status(403).json({ error: 'Acesso negado: parâmetros insuficientes.' });
            }
        }

        const pdfBuffer = await LegacyReportService.generateWeeklyReport(Number(week), Number(year), companyId, unitId);
        
        const fileName = `relatorio_semanal_${year}_${week}_${Date.now()}.pdf`;
        const pdfUrl = await uploadToS3(pdfBuffer, fileName, 'application/pdf', BUCKETS.RELATORIO_PDF);
        
        res.json({ url: pdfUrl });
    } catch (e: any) {
        console.error('Erro na geração do relatório semanal legado:', e);
        res.status(400).json({ error: e.message || 'Erro ao processar relatório semanal' });
    }
});


router.post('/reports/send-manual', authenticate, async (req: any, res: any) => {
    try {
        const { reportId } = req.body;
        
        const report = await prisma.weeklyReport.findUnique({ where: { id: reportId } });
        if (!report) return res.status(404).json({ error: 'Relatório não encontrado no servidor.' });
        
        const companyId = report.companyId;
        if (!companyId) return res.status(404).json({ error: 'Empresa do relatório não encontrada.' });
        
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (!company) return res.status(404).json({ error: 'Empresa não encontrada no banco.' });

        const recipientsSet = new Set<string>();
        const admins = await prisma.user.findMany({
            where: { companies: { has: companyId }, role: 'Administrador', blocked: false, status: 'Aprovado' }
        });
        admins.forEach(u => u.email && recipientsSet.add(u.email));
        
        let unitNameStr = '';
        if (report.unitId) {
             const unitObj = await prisma.unit.findUnique({ where: { id: report.unitId } });
             unitObj?.reportEmails?.forEach(email => recipientsSet.add(email.trim()));
             if (unitObj) unitNameStr = `(${unitObj.name})`;
        } else {
             company.reportEmails?.forEach(email => recipientsSet.add(email.trim()));
        }

        const allEmails = Array.from(recipientsSet);
        if (allEmails.length === 0) return res.status(400).json({ error: 'Não há e-mails cadastrados para essa filial ou empresa, nem administradores.' });

        let pdfBuffer: Buffer;
        const filename = report.pdfUrl ? report.pdfUrl.split('/').pop() || '' : '';
        if (filename && !filename.startsWith('http')) {
            try {
                const command = new GetObjectCommand({ Bucket: BUCKETS.RELATORIO_PDF, Key: filename });
                const s3response = await s3.send(command);
                const chunks: Uint8Array[] = [];
                for await (const chunk of s3response.Body as any) { chunks.push(chunk); }
                pdfBuffer = Buffer.concat(chunks);
            } catch (s3err) {
                console.log('S3 missing, regenerating manual...', s3err);
                pdfBuffer = await LegacyReportService.generateWeeklyReport(Number(report.week), Number(report.year), companyId, report.unitId || undefined);
            }
        } else {
             pdfBuffer = await LegacyReportService.generateWeeklyReport(Number(report.week), Number(report.year), companyId, report.unitId || undefined);
        }

        const emailHtml = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; text-align: center;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <div style="background-color: #ffffff; border-bottom: 3px solid #27AE60; padding: 30px 20px;">
                                        <img src="${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}/logos/logocompleto.png" alt="InspecPRO" style="height: 48px; object-fit: contain; margin-bottom: 5px;" onerror="this.outerHTML='<h1 style=\\'color: #27AE60; margin: 0; font-size: 28px; letter-spacing: 1px;\\'>InspecPRO</h1>'" />
                                        <p style="color: #555555; margin: 5px 0 0 0; font-size: 16px; font-weight: 500;">Relatório Semanal</p>
                                    </div>
                                    <div style="padding: 40px 30px; text-align: left;">
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Olá,</p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Segue em anexo o relatório de inspeções referente à <strong>Semana ${report.week}/${report.year}</strong> (${report.range || ''}).
                                        </p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Este documento foi gerado e enviado via sistema pela <strong>${company.name} ${unitNameStr}</strong>. Solicitamos que verifiquem os apontamentos referentes aos setores e locais pelos quais são responsáveis, auxiliando-nos na correção ou eliminação dos itens pontuados.
                                        </p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                                            Sua colaboração é fundamental para a melhoria contínua da nossa segurança.
                                        </p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Atenciosamente,<br/><strong>Equipe de Segurança do Trabalho</strong>
                                        </p>
                                        <div style="margin-top: 40px; border-top: 1px solid #eeeeee; padding-top: 20px; text-align: center;">
                                           <p style="color: #999999; font-size: 12px; margin: 0;">
                                              ⚠️ Este é um e-mail automático enviado pelo sistema InspecPRO a pedido de um usuário.<br>Por favor, não responda esta mensagem.
                                           </p>
                                        </div>
                                    </div>
                </div>
            </div>
        `;
        
        const emailSent = await sendEmail(
            allEmails.join(','),
            `Relatório Semanal - ${company.name} ${unitNameStr} [Semana ${report.week}/${report.year}]`,
            `O relatório da semana ${report.week}/${report.year} está em anexo.`,
            emailHtml,
            [{ filename: `relatorio_semanal_${report.week}_${report.year}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
        );

        if (emailSent) {
            for (const emailAddr of allEmails) {
                await logAction(req.user, 'EMAIL_SENT', 'weekly_reports', `Relatório Semanal manual enviado para: ${emailAddr}`);
            }
        }

        if (!emailSent) {
            return res.status(500).json({ error: 'Erro de conexão com o servidor de E-mail (SMTP). Verifique as variáveis de ambiente.' });
        }

        res.json({ success: true, count: allEmails.length, emails: allEmails });
    } catch (e: any) {
        console.error('Erro no envio manual:', e);
        res.status(500).json({ error: e.message || 'Erro ao processar envio manual.' });
    }
});
router.post('/reports/legacy/action-plan/:id', authenticate, async (req: any, res: any) => {
    try {
        const { id } = req.params;

        // SECURITY: Verify tenant access before generating PDF
        if (req.user.role !== 'Master') {
            const plan = await prisma.actionPlan.findUnique({ where: { id } });
            if (!plan) return res.status(404).json({ error: 'Plano de ação não encontrado.' });

            const userCompanies: string[] = req.user.companies || [];
            const userUnits: string[] = req.user.units || [];
            const userSectors: string[] = req.user.sectors || [];
            const userLocations: string[] = req.user.locations || [];
            let mySectorNames: string[] = req.user.sectorNames || [];
            let myUnitNames: string[] = req.user.unitNames || [];
            let myCompanyNames: string[] = req.user.companyNames || [];

            // SELF-HEALING: If token is missing company names or categories, fetch from DB
            if (myCompanyNames.length === 0 || (req.user.role === 'Gestor' && mySectorNames.length === 0)) {
                const freshUser = await prisma.user.findUnique({ where: { id: req.user.id } });
                if (freshUser) {
                    if (freshUser.company) myCompanyNames.push(freshUser.company.trim());
                    if (freshUser.companies.length > 0) {
                        const comps = await prisma.company.findMany({ where: { id: { in: freshUser.companies } }, select: { name: true } });
                        myCompanyNames = [...new Set([...myCompanyNames, ...comps.map(c => c.name.trim())])];
                    }
                    // For Gestor legacy fallback
                    if (freshUser.role === 'Gestor' && freshUser.sectors.length > 0) {
                        const assignedSectors = await prisma.sector.findMany({ where: { id: { in: freshUser.sectors } }, select: { name: true, unitName: true } });
                        mySectorNames = [...new Set(assignedSectors.map(s => s.name.trim()))];
                        myUnitNames = [...new Set(assignedSectors.map(s => s.unitName.trim()))];
                    }
                }
            }

            let allowed = false;

            if (req.user.role === 'Administrador') {
                const matchId = plan.companyId ? userCompanies.includes(plan.companyId) : false;
                const matchName = plan.company ? myCompanyNames.some(cn => cn.toLowerCase() === plan.company?.toLowerCase()) : false;
                
                allowed = matchId || matchName;
                
                if (!allowed) {
                    console.log(`[Audit Permission] Administrador negado. PlanID: ${id}`);
                    console.log(`  - Empresa no Plano: ID=${plan.companyId}, Nome="${plan.company}"`);
                    console.log(`  - Empresa no Perfil Usuário: IDs=[${userCompanies}], Nomes=[${myCompanyNames}]`);
                }
            } else if (req.user.role === 'Gestor') {
                // Direct UUID matches
                const matchSectorId = plan.sectorId ? userSectors.includes(plan.sectorId) : false;
                const matchLocationId = plan.locationId ? userLocations.includes(plan.locationId) : false;
                
                // Name-based fallback for legacy data
                const matchSectorName = plan.sector && mySectorNames.some(sn => sn.toLowerCase() === plan.sector?.toLowerCase());
                const matchUnitName = plan.unit && myUnitNames.some(un => un.toLowerCase() === plan.unit?.toLowerCase());
                const matchUnitId = plan.unitId ? userUnits.includes(plan.unitId) : false;
                
                const nameMatch = matchSectorName && (matchUnitId || matchUnitName);

                allowed = matchSectorId || matchLocationId || nameMatch;
            } else {
                // Normal User: Match by unit ID or name (legacy)
                const matchUnitId = plan.unitId ? userUnits.includes(plan.unitId) : false;
                const matchUnitName = plan.unit && myUnitNames.some(un => un.toLowerCase() === plan.unit?.toLowerCase());
                allowed = matchUnitId || matchUnitName;
            }

            if (!allowed) {
                return res.status(403).json({ error: 'Acesso negado: você não tem permissão para gerar relatório deste plano de ação.' });
            }
        }

        const pdfBuffer = await LegacyReportService.generateActionPlanPDF(id);
        const fileName = `plano_acao_${id}_${Date.now()}.pdf`;
        const pdfUrl = await uploadToS3(pdfBuffer, fileName, 'application/pdf', BUCKETS.RELATORIO_PDF);
        res.json({ url: pdfUrl });
    } catch (e: any) {
        console.error('Erro na geração do plano de ação legado:', e);
        res.status(400).json({ error: e.message || 'Erro ao processar plano de ação' });
    }
});


router.post('/reports/email-action-plan/:id', authenticate, async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const plan = await prisma.actionPlan.findUnique({ where: { id } });
        
        if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });
        
        if (req.user.role !== 'Master') {
            const userCompanies: string[] = req.user.companies || [];
            const userUnits: string[] = req.user.units || [];
            const userSectors: string[] = req.user.sectors || [];
            const userLocations: string[] = req.user.locations || [];
            let mySectorNames: string[] = req.user.sectorNames || [];
            let myUnitNames: string[] = req.user.unitNames || [];
            let myCompanyNames: string[] = req.user.companyNames || [];

            // SELF-HEALING: If token is missing data, fetch from DB
            if (myCompanyNames.length === 0 || (req.user.role === 'Gestor' && mySectorNames.length === 0)) {
                const freshUser = await prisma.user.findUnique({ where: { id: req.user.id } });
                if (freshUser) {
                    if (freshUser.company) myCompanyNames.push(freshUser.company.trim());
                    if (freshUser.companies.length > 0) {
                        const comps = await prisma.company.findMany({ where: { id: { in: freshUser.companies } }, select: { name: true } });
                        myCompanyNames = [...new Set([...myCompanyNames, ...comps.map(c => c.name.trim())])];
                    }
                }
            }

            let allowed = false;

            if (req.user.role === 'Administrador') {
                const matchId = plan.companyId ? userCompanies.includes(plan.companyId) : false;
                const matchName = plan.company ? myCompanyNames.some(cn => cn.toLowerCase() === plan.company?.toLowerCase()) : false;
                
                allowed = matchId || matchName;
            } else if (req.user.role === 'Gestor') {
                const matchSectorId = plan.sectorId ? userSectors.includes(plan.sectorId) : false;
                const matchLocationId = plan.locationId ? userLocations.includes(plan.locationId) : false;
                const matchSectorName = plan.sector && mySectorNames.some(sn => sn.toLowerCase() === plan.sector?.toLowerCase());
                const matchUnitName = plan.unit && myUnitNames.some(un => un.toLowerCase() === plan.unit?.toLowerCase());
                const matchUnitId = plan.unitId ? userUnits.includes(plan.unitId) : false;
                const nameMatch = matchSectorName && (matchUnitId || matchUnitName);
                allowed = matchSectorId || matchLocationId || nameMatch;
            } else {
                const matchUnitId = plan.unitId ? userUnits.includes(plan.unitId) : false;
                const matchUnitName = plan.unit && myUnitNames.some(un => un.toLowerCase() === plan.unit?.toLowerCase());
                allowed = matchUnitId || matchUnitName;
            }

            if (!allowed) {
                return res.status(403).json({ error: 'Acesso negado: você não tem permissão para enviar este plano de ação.' });
            }
        }

        const orConditions: any[] = [{ role: 'Master' }];
        let targetAdminCompanyId = plan.companyId;
        if (!targetAdminCompanyId && plan.company) {
            const matchedComp = await prisma.company.findFirst({ where: { name: plan.company } });
            if (matchedComp) targetAdminCompanyId = matchedComp.id;
        }
        if (targetAdminCompanyId) {
            orConditions.push({ role: 'Administrador', companies: { has: targetAdminCompanyId } });
        }

        const gestorAnd: any = { role: 'Gestor' };
        let hasGestorCondition = false;
        if (plan.sectorId) { gestorAnd.sectors = { has: plan.sectorId }; hasGestorCondition = true; }
        if (plan.locationId) { gestorAnd.locations = { has: plan.locationId }; hasGestorCondition = true; }
        if (plan.unitId) { gestorAnd.units = { has: plan.unitId }; hasGestorCondition = true; }
        
        if (hasGestorCondition) {
            orConditions.push(gestorAnd);
        }

        const admins = await prisma.user.findMany({
            where: {
                blocked: false,
                status: 'Aprovado',
                OR: orConditions
            }
        });

        const emails = admins.filter(a => a.email).map(a => a.email as string);
        
        if (emails.length === 0) {
            return res.json({ success: true, message: 'Plano gerado, mas nenhum administrador configurado para receber o e-mail.' });
        }

        const pdfBuffer = await LegacyReportService.generateActionPlanPDF(id);
        const fileName = `plano_acao_${plan.company?.replace(/[^a-zA-Z0-9]/g, '')}_${id}.pdf`;

        // Send individually to personalize the greeting
        for (const admin of admins.filter(a => a.email)) {
            const firstName = admin.displayName ? admin.displayName.split(' ')[0] : (admin.role === 'Gestor' ? 'Gestor' : 'Administrador');
            const unitNameStr = plan.unit ? ` (${plan.unit})` : '';

            const isGestor = admin.role === 'Gestor';
            const bodyIntro = isGestor
                ? `Conforme solicitado, enviamos a documentação atualizada confirmando que a inspeção no seu setor <strong>${plan.sector || '---'}</strong> foi devidamente tratada.`
                : `Para seu acompanhamento gerencial, segue a documentação referente ao Plano de Ação concluído no setor <strong>${plan.sector || '---'}</strong>. A tratativa já foi realizada pela equipe responsável.`;

            const emailHtml = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; text-align: center;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                        <div style="background-color: #ffffff; border-bottom: 3px solid #27AE60; padding: 30px 20px;">
                            <img src="${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}/logos/logocompleto.png" alt="InspecPRO" style="height: 48px; object-fit: contain; margin-bottom: 5px;" onerror="this.outerHTML='<h1 style=\'color: #27AE60; margin: 0; font-size: 28px; letter-spacing: 1px;\'>InspecPRO</h1>'" />
                            <p style="color: #555555; margin: 5px 0 0 0; font-size: 16px; font-weight: 500;">✅ Apontamento Fechado — Plano de Ação Criado</p>
                        </div>
                        <div style="padding: 40px 30px; text-align: left;">
                            <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Olá <strong>${firstName}</strong>,</p>
                            <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                ${bodyIntro}
                            </p>
                            <div style="padding: 15px; background-color: #f0faf5; border-left: 4px solid #27AE60; border-radius: 4px; margin-bottom: 20px;">
                                <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0;"><strong>Ação Corretiva (Resolução):</strong></p>
                                <p style="color: #555555; font-size: 14px; line-height: 1.6; margin: 8px 0 0 0;">${plan.actionDescription || 'Consultar relatório PDF em anexo.'}</p>
                                <p style="color: #27AE60; font-size: 12px; margin-top: 10px; font-weight: bold;">Local: ${plan.local || 'Geral'} | Setor: ${plan.sector || 'Não especificado'}</p>
                            </div>
                            <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                O documento oficial do Plano de Ação, contendo as fotografias do <strong>antes e depois</strong> do apontamento, está em anexo para seu registro.
                            </p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}" style="display: inline-block; padding: 14px 28px; background-color: #27AE60; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; border: none; cursor: pointer;">
                                    Acessar Sistema InspecPRO
                                </a>
                            </div>
                            <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                Atenciosamente,<br/><strong>Equipe InspecPRO</strong>
                            </p>
                        </div>
                    </div>
                </div>
            `;

            const emailSent = await sendEmail(
                admin.email as string,
                `✅ Plano de Ação Criado — ${plan.sector || 'Seu Setor'} (${plan.company || ''})`,
                `Um apontamento do seu setor foi fechado e um Plano de Ação foi criado.`,
                emailHtml,
                [{ filename: fileName, content: pdfBuffer, contentType: 'application/pdf' }]
            );

            if (emailSent) {
                await logAction(req.user, 'EMAIL_SENT', 'action_plans', `Plano de Ação enviado para: ${admin.email}`);
            }
        }

        res.json({ success: true, count: emails.length });
    } catch (e: any) {
        console.error('Erro ao enviar email de plano de ação:', e);
        res.status(500).json({ error: e.message || 'Erro ao enviar email' });
    }
});

router.post('/reports/email-critical-inspection/:id', authenticate, async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const inspection = await prisma.inspection.findUnique({ where: { id } });
        
        if (!inspection) return res.status(404).json({ error: 'Inspeção não encontrada' });
        
        if (!inspection.sectorId) return res.status(400).json({ error: 'Nenhum setor atrelado a este apontamento.' });

        const orConditions: any[] = [];
        
        let targetAdminCompanyId = inspection.companyId;
        if (!targetAdminCompanyId && inspection.company) {
            const matchedComp = await prisma.company.findFirst({ where: { name: inspection.company } });
            if (matchedComp) targetAdminCompanyId = matchedComp.id;
        }
        if (targetAdminCompanyId) {
            orConditions.push({ role: 'Administrador', companies: { has: targetAdminCompanyId } });
        }

        const gestorAnd: any = { role: 'Gestor' };
        let hasGestorFilter = false;

        if (inspection.unitId) { 
            gestorAnd.units = { has: inspection.unitId }; 
            hasGestorFilter = true; 
        }
        if (inspection.sectorId) { 
            gestorAnd.sectors = { has: inspection.sectorId }; 
            hasGestorFilter = true; 
        }
        if (inspection.locationId) { 
            gestorAnd.locations = { has: inspection.locationId }; 
            hasGestorFilter = true; 
        }

        if (hasGestorFilter) {
            orConditions.push(gestorAnd);
        }

        const managers = await prisma.user.findMany({
            where: {
                blocked: false,
                status: 'Aprovado',
                OR: orConditions
            }
        });

        const validManagers = managers.filter(a => a.email);
        
        if (validManagers.length === 0) {
            return res.json({ success: true, message: 'Nenhum gestor cadastrado neste setor para receber notificação.' });
        }

        let hexColor = '#F39C12'; // Laranja padrão
        let bgColor = '#fdfaf3';
        if (inspection.type) {
            const entryType = await prisma.typeOfEntry.findFirst({
                where: { name: inspection.type }
            });
            if (entryType && entryType.color) {
                hexColor = entryType.color.startsWith('#') ? entryType.color : '#' + entryType.color;
                bgColor = '#fcfcfc'; // Fundo mais neutro para combinar com qualquer cor
            }
        }

        let attachments: any[] = [];
        try {
            const pdfBuffer = await LegacyReportService.generateInspectionFindingPDF(inspection.id);
            attachments.push({
                filename: `Inspecao_${inspection.id.substring(0, 8)}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            });
        } catch (pdfErr) {
            console.error('Erro silencioso ao gerar PDF anexado do relatório:', pdfErr);
        }

        // Dispara e-mails individualmente para personalizar o nome
        for (const manager of validManagers) {
            const firstName = manager.displayName ? manager.displayName.split(' ')[0] : 'Gestor';
            
            const emailHtml = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; text-align: center;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                        <div style="background-color: #ffffff; border-bottom: 3px solid ${hexColor}; padding: 30px 20px;">
                            <img src="${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}/logos/logocompleto.png" width="160" height="48" alt="InspecPRO" style="height: 48px; width: 160px; object-fit: contain; margin-bottom: 5px;" onerror="this.outerHTML='<h1 style=\\'color: ${hexColor}; margin: 0; font-size: 28px; letter-spacing: 1px;\\'>InspecPRO</h1>'" />
                            <p style="color: #555555; margin: 5px 0 0 0; font-size: 16px; font-weight: 500;">🚨 Novo Apontamento de Inspeção</p>
                        </div>
                        <div style="padding: 40px 30px; text-align: left;">
                            <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Olá <strong>${firstName}</strong>,</p>
                            <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                Um novo apontamento foi registrado e direcionado ao setor pelo qual você é responsável: <strong>${inspection.sectorName || inspection.sectorId}</strong>.
                            </p>
                            <div style="padding: 15px; background-color: ${bgColor}; border-left: 4px solid ${hexColor}; border-radius: 4px; margin-bottom: 20px;">
                                <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0;"><strong>Detalhes do Apontamento:</strong></p>
                                <p style="color: #555555; font-size: 14px; line-height: 1.6; margin: 8px 0 0 0;">${inspection.description || 'Descrição indisponível.'}</p>
                                <p style="color: ${hexColor}; font-size: 12px; margin-top: 10px; font-weight: bold;">Local: ${inspection.locationName || inspection.locationId || 'Geral'} | Tipo: ${inspection.type || 'Não especificado'}</p>
                            </div>
                            <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                <strong>Ação de Fechamento Necessária:</strong><br/>
                                Para que este apontamento seja oficialmente concluído e baixado, é obrigatório que você acesse o sistema e <strong>crie um Plano de Ação</strong> referente a esse problema indicando a resolução e prazos.
                            </p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}" style="display: inline-block; padding: 14px 28px; background-color: #27AE60; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; border: none; cursor: pointer;">
                                    Acessar Sistema InspecPRO
                                </a>
                            </div>
                            <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                Atenciosamente,<br/><strong>Equipe InspecPRO</strong>
                            </p>
                        </div>
                    </div>
                </div>
            `;

            await sendEmail(
                manager.email as string, 
                `🔔 Novo Apontamento no Setor: ${inspection.sectorName || 'Seu Setor'}`, 
                `Um novo apontamento com ação obrigatória aguarda você no sistema.`, 
                emailHtml, 
                attachments
            );
        }

        res.json({ success: true, count: validManagers.length });
    } catch (e: any) {
        console.error('Erro ao enviar email de risco critico:', e);
        res.status(500).json({ error: e.message || 'Erro ao enviar email' });
    }
});

router.post('/reports/templates/upload', authenticate, upload.single('file'), async (req: any, res: any) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        
        const { companyId, type, companyName } = req.body;
        if (!companyId || !type) {
            return res.status(400).json({ error: 'companyId e type são obrigatórios.' });
        }

        // SECURITY: Verify that the user has access to upload templates for this company
        if (req.user.role !== 'Master') {
            const userCompanies: string[] = req.user.companies || [];
            if (!userCompanies.includes(companyId)) {
                return res.status(403).json({ error: 'Acesso negado: você não tem permissão para enviar templates para esta empresa.' });
            }
        }

        // SECURITY: Validate file type by extension and mimetype (only pptx, ppt, jpg, png, pdf allowed)
        const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'];
        if (!allowedMimes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Tipo de arquivo não permitido. Use PPTX, PNG, JPG ou PDF.' });
        }

        const safeCompanyName = (companyName || companyId).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const fileName = `template_${safeCompanyName}_${type}_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const fileUrl = await uploadToS3(req.file.buffer, fileName, req.file.mimetype, BUCKETS.MODELOS_RELATORIOS);
        
        const template = await prisma.reportTemplate.upsert({
            where: { id: (await prisma.reportTemplate.findFirst({ where: { companyId, type } }))?.id || 'new-uuid' },
            update: { minioUrl: fileUrl, companyName: companyName || '', content: {} },
            create: { companyId, type, minioUrl: fileUrl, companyName: companyName || '', content: {} }
        });

        await logAction(req.user, 'UPLOAD', 'report_templates', `Subiu modelo ${type} para ${companyName || companyId}`);
        
        res.json({ success: true, url: fileUrl, template });
    } catch (e: any) {
        console.error('Erro no upload de template:', e);
        res.status(500).json({ error: 'Erro ao salvar template' }); // details removed from client response
    }
});


export default router;


