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
            // Obter hora local em Brasília (BRT)
            const dateInBrt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            
            const currentDay = dateInBrt.getDay();
            const hour = dateInBrt.getHours().toString().padStart(2, '0');
            const minute = dateInBrt.getMinutes().toString().padStart(2, '0');
            const currentTimeStr = `${hour}:${minute}`;

            // Busca empresas que tenham o dia e horário atual exato (Apenas as que caírem no fallback 'Geral')
            const companiesToTrigger = await prisma.company.findMany({
                where: { reportScheduleDay: currentDay, reportScheduleTime: currentTimeStr }
            });

            // Busca as filiais que tenham o dia e horário atual configurado
            const unitsToTrigger = await prisma.unit.findMany({
                where: { reportScheduleDay: currentDay, reportScheduleTime: currentTimeStr }
            });

            if (companiesToTrigger.length === 0 && unitsToTrigger.length === 0) return;

            console.log(`[CRON] Disparando relatórios automáticos das ${currentTimeStr} para ${companiesToTrigger.length} matriz(es) e ${unitsToTrigger.length} filial(is)...`);

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
                            OR: [
                                { companies: { has: company.id } },
                                { units: { has: unit.id } }
                            ],
                            role: { in: ['Administrador', 'Gestor'] }, 
                            blocked: false, 
                            status: 'Aprovado' 
                        }
                    });
                    
                    eligibleUsers.forEach(u => {
                        if (u.email) recipients.set(u.email.toLowerCase().trim(), u.displayName || u.name);
                    });
                    unit.reportEmails?.forEach(email => {
                        const e = email.toLowerCase().trim();
                        if (e && !recipients.has(e)) recipients.set(e, null);
                    });

                    for (const [emailAddr, recipientName] of recipients.entries()) {
                        const greeting = recipientName ? `Olá ${recipientName},` : `Olá,`;
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
                                            Segue em anexo o relatório de inspeções referente à <strong>Semana ${week}/${year}</strong> (${weekRange.full}).
                                        </p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Este documento foi gerado e enviado automaticamente via sistema pela <strong>${company.name} (${unit.name})</strong>. Solicitamos que verifiquem os apontamentos referentes aos setores e locais pelos quais são responsáveis, auxiliando-nos na correção ou eliminação dos itens pontuados.
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

                        const emailSent = await sendEmail(emailAddr, `Relatório Semanal de Segurança - ${company.name} (${unit.name}) [Semana ${week}/${year}]`, `Relatório anexo.`, emailHtml, [{ filename: fileName, content: pdfBuffer, contentType: 'application/pdf' }]);
                        if (emailSent) {
                            await logAction('EMAIL_SENT', 'weekly_reports', `Relatório Semanal automático (Filial) enviado para: ${emailAddr}`);
                        }
                    }
                    console.log(`[CRON] Processado filial ${unit.name} para ${recipients.size} destinatário(s) individualmente.`);
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
                    
                    eligibleUsers.forEach(u => {
                        if (u.email) recipients.set(u.email.toLowerCase().trim(), u.displayName || u.name);
                    });
                    company.reportEmails?.forEach(email => {
                        const e = email.toLowerCase().trim();
                        if (e && !recipients.has(e)) recipients.set(e, null);
                    });

                    for (const [emailAddr, recipientName] of recipients.entries()) {
                        const greeting = recipientName ? `Olá ${recipientName},` : `Olá,`;
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
                                            Segue em anexo o relatório de inspeções referente à <strong>Semana ${week}/${year}</strong> (${weekRange.full}).
                                        </p>
                                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                                            Este documento foi gerado e enviado automaticamente via sistema pela <strong>${company.name} (Geral)</strong>. Solicitamos que verifiquem os apontamentos referentes aos setores e locais pelos quais são responsáveis, auxiliando-nos na correção ou eliminação dos itens pontuados.
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

                        const emailSent = await sendEmail(emailAddr, `Relatório Semanal de Segurança - ${company.name} [Semana ${week}/${year}]`, `Relatório anexo.`, emailHtml, [{ filename: fileName, content: pdfBuffer, contentType: 'application/pdf' }]);
                        if (emailSent) {
                            await logAction('EMAIL_SENT', 'weekly_reports', `Relatório Semanal automático (Geral) enviado para: ${emailAddr}`);
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
