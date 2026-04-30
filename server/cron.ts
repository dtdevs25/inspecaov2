import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from './email';
import { LegacyReportService } from './reports/LegacyReportService';
import { uploadToS3, BUCKETS, s3 } from './s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();

// Utilitário para pegar número da semana atual do ano
const getCurrentWeek = (date: Date) => {
  const onejan = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil((((date.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return week > 52 ? 52 : week;
};

// Formatação do range
const getWeekRange = (week: number, year: number) => {
  const janFirst = new Date(year, 0, 1);
  const days = (week - 1) * 7;
  const start = new Date(year, 0, 1 + days);
  const dayOfWeek = start.getDay();
  start.setDate(start.getDate() - dayOfWeek + 1); 
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
     start: start.toLocaleDateString('pt-BR'),
     end: end.toLocaleDateString('pt-BR'),
     full: `${start.toLocaleDateString('pt-BR')} à ${end.toLocaleDateString('pt-BR')}`
  };
};

const logAction = async (action: string, resource: string, details: string) => {
    try {
        await prisma.systemLog.create({
            data: {
                userId: 'system',
                userName: 'Sistema (Automático)',
                userEmail: 'sistema@inspecpro.com.br',
                action,
                resource,
                details: details.substring(0, 500),
                createdAt: new Date()
            }
        });
    } catch (e) {
        console.error('[CRON] Falha ao registrar log:', e);
    }
};

export const startCronJobs = () => {
    // Roda a cada minuto
    cron.schedule('* * * * *', async () => {
        try {
            // Obter data/hora atual em Brasília (BRT) de forma robusta
            const now = new Date();
            const brtParts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Sao_Paulo',
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
                weekday: 'short',
                day: 'numeric',
                month: 'numeric',
                year: 'numeric'
            }).formatToParts(now);

            const getPart = (type: string) => brtParts.find(p => p.type === type)?.value;
            
            const weekdayShort = getPart('weekday') || 'Sun';
            const dayMap: { [key: string]: number } = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
            const currentDay = dayMap[weekdayShort] ?? 0;

            const currentTimeStr = `${getPart('hour')}:${getPart('minute')}`;
            
            // Para cálculos de semana e ano, precisamos de um objeto Date que reflita o dia correto em BRT
            const brtYear = parseInt(getPart('year') || '0');
            const brtMonth = parseInt(getPart('month') || '0') - 1;
            const brtDay = parseInt(getPart('day') || '0');
            const brtHour = parseInt(getPart('hour') || '0');
            const brtMin = parseInt(getPart('minute') || '0');
            const dateInBrt = new Date(brtYear, brtMonth, brtDay, brtHour, brtMin);

            // Busca empresas que tenham o dia e horário atual exato
            const companiesToTrigger = await prisma.company.findMany({
                where: { reportScheduleDay: currentDay, reportScheduleTime: currentTimeStr }
            });

            // Busca as filiais que tenham o dia e horário atual configurado
            const unitsToTrigger = await prisma.unit.findMany({
                where: { reportScheduleDay: currentDay, reportScheduleTime: currentTimeStr }
            });

            if (companiesToTrigger.length === 0 && unitsToTrigger.length === 0) {
                return;
            }

            console.log(`[CRON] >>> GATILHO DETECTADO às ${currentTimeStr} (Dia da semana: ${currentDay})`);
            console.log(`[CRON] Matrizes encontradas: ${companiesToTrigger.length}`);
            console.log(`[CRON] Filiais encontradas: ${unitsToTrigger.length}`);

            const week = getCurrentWeek(dateInBrt);
            const year = dateInBrt.getFullYear();
            const weekRange = getWeekRange(week, year);

            // 1) Processar relatórios para filiais individuais
            for (const unit of unitsToTrigger) {
                try {
                    const company = await prisma.company.findUnique({ where: { id: unit.companyId } });
                    if (!company) continue;

                    // Verifica se já gerou no passado e faz o descarte (para recriar versão final de sexta)
                    const alreadyGenerated = await prisma.weeklyReport.findMany({
                        where: { companyId: company.id, unitId: unit.id, week, year }
                    });
                    
                    if (alreadyGenerated.length > 0) {
                        for (const oldReport of alreadyGenerated) {
                            const filename = oldReport.pdfUrl ? oldReport.pdfUrl.split('/').pop() || '' : '';
                            if (filename && !filename.startsWith('http')) {
                                try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKETS.RELATORIO_PDF, Key: filename })); } catch(e){}
                            }
                        }
                        await prisma.weeklyReport.deleteMany({
                            where: { companyId: company.id, unitId: unit.id, week, year }
                        });
                        console.log(`[CRON] Removido relatório(s) anterior(es) da filial ${unit.name} para recriar o arquivo consolidado final programado.`);
                    }

                    console.log(`[CRON] Gerando para filial configurada: ${company.name} - ${unit.name}`);
                    const pdfBuffer = await LegacyReportService.generateWeeklyReport(week, year, company.id, unit.id);
                    
                    const fileName = `relatorio_semanal_${company.name.replace(/[^a-zA-Z0-9]/g, '')}_${unit.name.replace(/[^a-zA-Z0-9]/g, '')}_${year}_${week}_${Date.now()}.pdf`;
                    const pdfUrl = await uploadToS3(pdfBuffer, fileName, 'application/pdf', BUCKETS.RELATORIO_PDF);

                    const reportName = `${unit.name} - Sem ${week.toString().padStart(2, '0')}`;
                    
                    await prisma.weeklyReport.create({
                        data: {
                            name: reportName,
                            company: company.name,
                            unit: unit.name,
                            companyId: company.id,
                            unitId: unit.id,
                            week,
                            year,
                            range: weekRange.full,
                            pdfUrl,
                            createdAt: new Date()
                        }
                    });

                    // Prepara Destinatários da filial (Map para evitar duplicidade e manter nomes)
                    const recipients = new Map<string, string | null>();
                    
                    const eligibleUsers = await prisma.user.findMany({
                        where: { 
                            units: { has: unit.id },
                            role: { in: ['Administrador', 'Gestor'] }, 
                            blocked: false, 
                            status: 'Aprovado' 
                        }
                    });
                    
                    console.log(`[CRON] [Filial: ${unit.name}] Usuários elegíveis encontrados: ${eligibleUsers.length}`);
                    eligibleUsers.forEach(u => {
                        if (u.email) recipients.set(u.email.toLowerCase().trim(), u.displayName || u.name);
                    });
                    unit.reportEmails?.forEach(email => {
                        const e = email.toLowerCase().trim();
                        if (e && !recipients.has(e)) recipients.set(e, null);
                    });

                    if (recipients.size === 0) {
                        console.log(`[CRON] [Filial: ${unit.name}] AVISO: Nenhum destinatário encontrado (nem usuários vinculados nem e-mails fixos).`);
                        continue;
                    }

                    console.log(`[CRON] [Filial: ${unit.name}] Enviando para ${recipients.size} destinatário(s): ${Array.from(recipients.keys()).join(', ')}`);
                    for (const [emailAddr, recipientName] of recipients.entries()) {
                        const greeting = recipientName ? `Olá ${recipientName},` : `Olá,`;
                        const fullPdfUrl = `${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}${pdfUrl}`;
                        const emailHtml = `
                            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; text-align: center;">
                                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                                    <div style="background-color: #ffffff; border-bottom: 3px solid #27AE60; padding: 30px 20px;">
                                        <img src="${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}/logos/logocompleto.png" alt="InspecPRO" style="height: 48px; object-fit: contain; margin-bottom: 5px;" onerror="this.outerHTML='<h1 style=\\'color: #27AE60; margin: 0; font-size: 28px; letter-spacing: 1px;\\'>InspecPRO</h1>'" />
                                        <p style="color: #555555; margin: 5px 0 0 0; font-size: 16px; font-weight: 500;">Relatório Semanal</p>
                                    </div>
                                    <div style="padding: 40px 30px; text-align: left;">
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">${greeting}</p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Segue o relatório de inspeções referente à <strong>Semana ${week}/${year}</strong> (${weekRange.full}).
                                        </p>
                                        <div style="text-align: center; margin: 30px 0;">
                                            <a href="${fullPdfUrl}" style="background-color: #27AE60; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 10px rgba(39,174,96,0.2);">Visualizar Relatório Completo (PDF)</a>
                                        </div>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Este documento foi gerado automaticamente via sistema pela <strong>${company.name} (${unit.name})</strong>. Solicitamos que verifiquem os apontamentos referentes aos setores e locais pelos quais são responsáveis, auxiliando-nos na correção ou eliminação dos itens pontuados.
                                        </p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                                            Sua colaboração é fundamental para a melhoria contínua da nossa segurança.
                                        </p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Atenciosamente,<br/><strong>Equipe de Segurança do Trabalho</strong>
                                        </p>
                                        <div style="margin-top: 40px; border-top: 1px solid #eeeeee; padding-top: 20px; text-align: center;">
                                           <p style="color: #999999; font-size: 12px; margin: 0;">
                                              ⚠️ Este é um e-mail automático enviado pelo sistema InspecPRO.<br>Por favor, não responda esta mensagem.
                                           </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;

                        // Somente anexa se o arquivo for menor que 15MB para evitar erros de SMTP (552 message too big)
                        const attachments = pdfBuffer.length < 15 * 1024 * 1024 
                            ? [{ filename: fileName, content: pdfBuffer, contentType: 'application/pdf' }]
                            : [];
                        
                        if (attachments.length === 0) {
                            console.log(`[CRON] [Filial: ${unit.name}] Relatório muito grande (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB). Enviando apenas link.`);
                        }

                        const emailSent = await sendEmail(emailAddr, `Relatório Semanal de Segurança - ${company.name} (${unit.name}) [Semana ${week}/${year}]`, `Relatório disponível em: ${fullPdfUrl}`, emailHtml, attachments);
                        if (emailSent) {
                            console.log(`[CRON] [Filial: ${unit.name}] E-mail enviado com sucesso para ${emailAddr}`);
                            await logAction('EMAIL_SENT', 'weekly_reports', `Relatório Semanal automático (Filial) enviado para: ${emailAddr}`);
                        } else {
                            console.error(`[CRON] [Filial: ${unit.name}] FALHA ao enviar e-mail para ${emailAddr}`);
                        }
                    }
                    console.log(`[CRON] [Filial: ${unit.name}] Processamento concluído.`);
                } catch (e: any) {
                     if (e.message && e.message.includes('Não existem dados suficientes')) {
                         console.log(`[CRON] Ignorando filial ${unit.name}: Não há dados.`);
                     } else {
                         console.error(`[CRON] Erro unidade ${unit.name}:`, e);
                     }
                }
            }

            // 2) Processar Empresas "Sem Filiais"
            for (const company of companiesToTrigger) {
                try {
                    const compUnits = await prisma.unit.findMany({ where: { companyId: company.id } });
                    if (compUnits.length > 0) continue; // Se tem filial, já foi ou será processada no outro laço individualmente.

                    const alreadyGenerated = await prisma.weeklyReport.findMany({
                        where: { companyId: company.id, unitId: null, week, year }
                    });
                    
                    if (alreadyGenerated.length > 0) {
                        for (const oldReport of alreadyGenerated) {
                            const filename = oldReport.pdfUrl ? oldReport.pdfUrl.split('/').pop() || '' : '';
                            if (filename && !filename.startsWith('http')) {
                                try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKETS.RELATORIO_PDF, Key: filename })); } catch(e){}
                            }
                        }
                        await prisma.weeklyReport.deleteMany({
                            where: { companyId: company.id, unitId: null, week, year }
                        });
                        console.log(`[CRON] Removido relatório anterior Geral da empresa ${company.name} para recriar arquivo final programado.`);
                    }

                    console.log(`[CRON] Gerando relatório geral-sem-filiais para ${company.name}...`);
                    const pdfBuffer = await LegacyReportService.generateWeeklyReport(week, year, company.id, undefined);
                    
                    const fileName = `relatorio_semanal_${company.name.replace(/[^a-zA-Z0-9]/g, '')}_Geral_${year}_${week}_${Date.now()}.pdf`;
                    const pdfUrl = await uploadToS3(pdfBuffer, fileName, 'application/pdf', BUCKETS.RELATORIO_PDF);

                    const reportName = `${company.name} - Sem ${week.toString().padStart(2, '0')}`;
                    
                    await prisma.weeklyReport.create({
                        data: { name: reportName, company: company.name, unit: 'Geral', companyId: company.id, unitId: null, week, year, range: weekRange.full, pdfUrl, createdAt: new Date() }
                    });

                    const recipients = new Map<string, string | null>();
                    const eligibleUsers = await prisma.user.findMany({ 
                        where: { companies: { has: company.id }, role: { in: ['Administrador', 'Gestor'] }, blocked: false, status: 'Aprovado' } 
                    });
                    
                    console.log(`[CRON] [Matriz: ${company.name}] Usuários elegíveis encontrados: ${eligibleUsers.length}`);
                    eligibleUsers.forEach(u => {
                        if (u.email) recipients.set(u.email.toLowerCase().trim(), u.displayName || u.name);
                    });
                    company.reportEmails?.forEach(email => {
                        const e = email.toLowerCase().trim();
                        if (e && !recipients.has(e)) recipients.set(e, null);
                    });

                    if (recipients.size === 0) {
                        console.log(`[CRON] [Matriz: ${company.name}] AVISO: Nenhum destinatário encontrado.`);
                        continue;
                    }

                    console.log(`[CRON] [Matriz: ${company.name}] Enviando para ${recipients.size} destinatário(s): ${Array.from(recipients.keys()).join(', ')}`);
                    for (const [emailAddr, recipientName] of recipients.entries()) {
                        const greeting = recipientName ? `Olá ${recipientName},` : `Olá,`;
                        const fullPdfUrl = `${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}${pdfUrl}`;
                        const emailHtml = `
                            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 40px 20px; text-align: center;">
                                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                                    <div style="background-color: #ffffff; border-bottom: 3px solid #27AE60; padding: 30px 20px;">
                                        <img src="${process.env.FRONTEND_URL || 'https://inspecao.ehspro.com.br'}/logos/logocompleto.png" alt="InspecPRO" style="height: 48px; object-fit: contain; margin-bottom: 5px;" onerror="this.outerHTML='<h1 style=\\'color: #27AE60; margin: 0; font-size: 28px; letter-spacing: 1px;\\'>InspecPRO</h1>'" />
                                        <p style="color: #555555; margin: 5px 0 0 0; font-size: 16px; font-weight: 500;">Relatório Semanal</p>
                                    </div>
                                    <div style="padding: 40px 30px; text-align: left;">
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">${greeting}</p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Segue o relatório de inspeções referente à <strong>Semana ${week}/${year}</strong> (${weekRange.full}).
                                        </p>
                                        <div style="text-align: center; margin: 30px 0;">
                                            <a href="${fullPdfUrl}" style="background-color: #27AE60; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 10px rgba(39,174,96,0.2);">Visualizar Relatório Completo (PDF)</a>
                                        </div>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Este documento foi gerado automaticamente via sistema pela <strong>${company.name}</strong>. Solicitamos que verifiquem os apontamentos referentes aos setores e locais pelos quais são responsáveis, auxiliando-nos na correção ou eliminação dos itens pontuados.
                                        </p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                                            Sua colaboração é fundamental para a melhoria contínua da nossa segurança.
                                        </p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Atenciosamente,<br/><strong>Equipe de Segurança do Trabalho</strong>
                                        </p>
                                        <div style="margin-top: 40px; border-top: 1px solid #eeeeee; padding-top: 20px; text-align: center;">
                                           <p style="color: #999999; font-size: 12px; margin: 0;">
                                              ⚠️ Este é um e-mail automático enviado pelo sistema InspecPRO.<br>Por favor, não responda esta mensagem.
                                           </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;

                        // Somente anexa se o arquivo for menor que 15MB para evitar erros de SMTP
                        const attachments = pdfBuffer.length < 15 * 1024 * 1024 
                            ? [{ filename: fileName, content: pdfBuffer, contentType: 'application/pdf' }]
                            : [];

                        const emailSent = await sendEmail(emailAddr, `Relatório Semanal de Segurança - ${company.name} [Semana ${week}/${year}]`, `Relatório disponível em: ${fullPdfUrl}`, emailHtml, attachments);
                        if (emailSent) {
                            console.log(`[CRON] [Matriz: ${company.name}] E-mail enviado com sucesso para ${emailAddr}`);
                            await logAction('EMAIL_SENT', 'weekly_reports', `Relatório Semanal automático (Geral) enviado para: ${emailAddr}`);
                        } else {
                            console.error(`[CRON] [Matriz: ${company.name}] FALHA ao enviar e-mail para ${emailAddr}`);
                        }
                    }
                    console.log(`[CRON] Processado empresa ${company.name} para ${recipients.size} destinatário(s) individualmente.`);
                } catch (e: any) {
                     if (!e.message?.includes('Não existem dados')) console.error(`[CRON] Erro geral empresa ${company.name}:`, e);
                }
            }
        } catch (globalCronError) {
            console.error('[CRON] Erro na engine agendadora:', globalCronError);
        }
    });
};
