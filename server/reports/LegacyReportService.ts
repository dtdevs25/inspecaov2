import { PrismaClient } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import { s3, BUCKETS } from '../s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();
const mmToPt = (mm: number) => mm * 2.83465;

export class LegacyReportService {
    private static ASSETS_PATH = path.join(process.cwd(), 'server', 'assets', 'reports');

    private static async getFileBuffer(filePath: string): Promise<Buffer | null> {
        try {
            return await fs.readFile(filePath);
        } catch (e) {
            return null;
        }
    }

    private static async getS3FileBuffer(bucket: string, key: string): Promise<Buffer | null> {
        try {
            const command = new GetObjectCommand({ Bucket: bucket, Key: key });
            const response = await s3.send(command);
            const chunks: Uint8Array[] = [];
            for await (const chunk of response.Body as any) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        } catch (e) {
            return null;
        }
    }

    private static async resolveImageBuffer(urlOrPath: string): Promise<Buffer | null> {
        if (!urlOrPath) return null;

        if (urlOrPath.startsWith('http') || urlOrPath.startsWith('/api/files/')) {
            let bucket = '';
            let key = '';

            if (urlOrPath.includes('/api/files/')) {
                const parts = urlOrPath.split('/');
                const bucketIdx = parts.indexOf('files') + 1;
                bucket = parts[bucketIdx];
                key = parts.slice(bucketIdx + 1).join('/');
            } else {
                try {
                    const url = new URL(urlOrPath);
                    let pathParts = url.pathname.split('/').filter(Boolean);
                    
                    // Handle MinIO browser prefix if present
                    if (pathParts[0] === 'browser') {
                        pathParts = pathParts.slice(1);
                    }

                    if (pathParts.length >= 2) {
                        bucket = pathParts[0];
                        key = pathParts.slice(1).join('/');
                    }
                } catch { return null; }
            }

            if (bucket && key) {
                const buf = await this.getS3FileBuffer(bucket, key);
                if (buf) return buf;
            }

            // Fallback: Try a real HTTP fetch if S3 failed but it looks like a URL
            try {
                const fetchResponse = await fetch(urlOrPath);
                if (fetchResponse.ok) {
                    const arrayBuffer = await fetchResponse.arrayBuffer();
                    return Buffer.from(arrayBuffer);
                }
            } catch (e) {
                // Ignore fetch errors and continue to filesystem fallback
            }
        }

        const filename = path.basename(urlOrPath);

        // EXTRA FALLBACK: If it's just a filename (no protocol, no /api/files/), 
        // try to fetch it directly from the primary S3 buckets before checking local disk.
        if (filename && !urlOrPath.includes('/') && !urlOrPath.includes('\\')) {
            const possibleBuckets = ['foto-inspecao', 'foto-planodeacao'];
            for (const b of possibleBuckets) {
                const buf = await this.getS3FileBuffer(b, filename);
                if (buf) return buf;
            }
        }

        const possiblePaths = [
            path.join(this.ASSETS_PATH, filename),
            path.join(process.cwd(), 'server', 'assets', 'reports', filename),
            path.join(process.cwd(), 'public', filename)
        ];

        for (const p of possiblePaths) {
            const buf = await this.getFileBuffer(p);
            if (buf) return buf;
        }

        return null;
    }

    private static async drawText(page: PDFPage, text: string, x: number, y: number, options: { font: PDFFont, size: number, color?: any, maxWidth?: number, initialXOffset?: number }) {
        const { font, size, color = rgb(0.3, 0.3, 0.3), maxWidth = 300, initialXOffset = 0 } = options;
        
        // Remove WinAnsi unsupported characters (like newline 0x000a) by replacing them with spaces
        const cleanText = (text || '').replace(/[\r\n\t]+/g, ' ');
        const words = cleanText.split(' ');
        
        let line = '';
        let currentY = y;
        let isFirstLine = true;
        for (const word of words) {
            if (!word) continue;
            // Also strip any other non-printable characters that could break WinAnsi
            const cleanWord = word.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
            const testLine = line + (line ? ' ' : '') + cleanWord;
            const currentMaxWidth = isFirstLine ? maxWidth - initialXOffset : maxWidth;
            
            try {
                if (font.widthOfTextAtSize(testLine, size) < currentMaxWidth) {
                    line = testLine;
                } else {
                    if (line) page.drawText(line, { x: isFirstLine ? x + initialXOffset : x, y: currentY, size, font, color });
                    line = cleanWord;
                    currentY -= size * 1.2;
                    isFirstLine = false;
                }
            } catch (e) {
                line = testLine; // Fallback if width check fails for some weird char
            }
        }
        
        if (line) {
            try {
                page.drawText(line, { x: isFirstLine ? x + initialXOffset : x, y: currentY, size, font, color });
            } catch (e) {}
        }
        return currentY - size * 1.2;
    }

    private static async resolveBackground(companyId: string | null, type: string, defaultFile: string): Promise<Buffer> {
        let template = null;
        if (companyId) {
            // Standard exact match
            template = await prisma.reportTemplate.findFirst({
                where: { OR: [{ companyId }, { companyName: companyId }], type }
            });

            // Fuzzy match fallback (ignore trailing dots and case)
            if (!template) {
                const cleanName = companyId.replace(/\.*$/, '').trim();
                template = await prisma.reportTemplate.findFirst({
                    where: {
                        OR: [
                            { companyName: { contains: cleanName, mode: 'insensitive' } },
                            { companyId: cleanName }
                        ],
                        type
                    }
                });
            }
        }

        if (!template) {
            template = await prisma.reportTemplate.findFirst({
                where: { OR: [{ companyId: 'default' }, { companyName: 'SISTEMA' }, { companyId: 'Todas' }, { companyName: 'Todas' }, { companyId: 'Global' }, { companyName: 'Global' }], type }
            });
        }

        if (!template && (type === 'MainCover' || type === 'SectorCover')) {
            const altType = type === 'MainCover' ? 'SectorCover' : 'MainCover';
            template = await prisma.reportTemplate.findFirst({
                where: {
                    OR: [
                        { companyId: companyId || 'default' },
                        { companyName: companyId || 'SISTEMA' },
                        { companyId: 'default' },
                        { companyName: 'SISTEMA' },
                        { companyName: 'Global' }
                    ],
                    type: altType
                }
            });
        }

        if (template && template.minioUrl) {
            const buf = await this.resolveImageBuffer(template.minioUrl);
            if (buf) return buf;
        }

        const globalDefaultMap: Record<string, string> = {
            'Findings': 'default_findings.jpg',
            'MainCover': 'default_sector.jpg',
            'SectorCover': 'default_sector.jpg',
            'ActionPlan': 'default_actionplan.png',
            'Resolvido': 'default_resolvido.png',
            'Resolver': 'default_resolver.png'
        };

        const key = globalDefaultMap[type] || globalDefaultMap[defaultFile.split('.')[0]];
        if (key) {
           const buf = await this.getS3FileBuffer(BUCKETS.MODELOS_RELATORIOS, key);
           if (buf) return buf;
        }

        const bufDirect = await this.getS3FileBuffer(BUCKETS.MODELOS_RELATORIOS, defaultFile);
        if (bufDirect) return bufDirect;

        const fallback = await this.getFileBuffer(path.join(this.ASSETS_PATH, defaultFile));
        if (!fallback) {
             const fallback2 = await this.getFileBuffer(path.join(process.cwd(), 'server', 'assets', 'reports', defaultFile));
             if (fallback2) return fallback2;
             return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
        }
        return fallback;
    }

    static async generateWeeklyReport(week: number, year: number, companyId?: string, unitId?: string) {
        const days = (week - 1) * 7;
        const startDate = new Date(year, 0, 1 + days);
        const dayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const inspections = await prisma.inspection.findMany({
            where: {
                companyId: companyId || undefined,
                unitId: unitId || undefined,
                date: { gte: startStr, lte: endStr }
            },
            orderBy: [{ sectorName: 'asc' }, { locationName: 'asc' }]
        });

        if (inspections.length === 0) {
            throw new Error('Não existem dados suficientes para gerar o relatório nesta semana.');
        }

        const allInspections = await prisma.inspection.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true }
        });
        const getSeq = (id: string) => {
            const idx = allInspections.findIndex(i => i.id === id);
            return idx === -1 ? 0 : allInspections.length - idx;
        };
        const typeEntries = await prisma.typeOfEntry.findMany();
        const typeColors = new Map(typeEntries.map(t => [(t.name || '').trim().toLowerCase(), t.color]));
        
        const ptBrOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
        const rangeText = `${startDate.toLocaleDateString('pt-BR', ptBrOptions)} à ${endDate.toLocaleDateString('pt-BR', ptBrOptions)}`;

        const pdfDoc = await PDFDocument.create();
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontItalicSource = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

        const effCompanyId = companyId || inspections[0]?.companyId || inspections[0]?.companyName || null;
        let companyActualName = inspections[0]?.companyName;
        if (!companyActualName && effCompanyId) {
            const comp = await prisma.company.findFirst({
                where: { OR: [{ id: effCompanyId }, { name: effCompanyId }] }
            });
            if (comp) companyActualName = comp.name;
        }
        if (!companyActualName) companyActualName = 'RELATÓRIO DE INSPEÇÃO';

        const bgMainBuf = await this.resolveBackground(effCompanyId, 'Findings', 'fundo.jpg');
        const bgSectorBuf = await this.resolveBackground(effCompanyId, 'SectorCover', 'fundo1.jpg');
        const bgMainCoverBuf = await this.resolveBackground(effCompanyId, 'MainCover', 'fundo1.jpg');
        
        const isMainPng = bgMainBuf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
        const isCoverPng = bgSectorBuf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
        const isMainCoverPng = bgMainCoverBuf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';

        const bgMain = isMainPng ? await pdfDoc.embedPng(bgMainBuf) : await pdfDoc.embedJpg(bgMainBuf);
        const bgSector = isCoverPng ? await pdfDoc.embedPng(bgSectorBuf) : await pdfDoc.embedJpg(bgSectorBuf);
        const bgMainCover = isMainCoverPng ? await pdfDoc.embedPng(bgMainCoverBuf) : await pdfDoc.embedJpg(bgMainCoverBuf);

        const groups: Record<string, any[]> = {};
        for (const insp of inspections) {
            const key = `${insp.sectorName || 'N/A'}|${insp.locationName || 'N/A'}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(insp);
        }

        let pageIndex = 1;
        const mainCoverPage = pdfDoc.addPage([mmToPt(297), mmToPt(210)]);
        mainCoverPage.drawImage(bgMainCover, { x: 0, y: 0, width: mmToPt(297), height: mmToPt(210) });
        
        const titleText = `Relatório de Inspeção de Segurança`;
        const weekText = `Semana ${week.toString().padStart(2, '0')} - ${rangeText}`;
        
        mainCoverPage.drawText(titleText, {
            x: (mmToPt(297) - fontBold.widthOfTextAtSize(titleText, 35)) / 2,
            y: mmToPt(210) - mmToPt(105),
            size: 35, font: fontBold, color: rgb(0, 0.337, 0.588)
        });
        
        mainCoverPage.drawText(companyActualName, {
            x: (mmToPt(297) - fontRegular.widthOfTextAtSize(companyActualName, 24)) / 2,
            y: mmToPt(210) - mmToPt(120),
            size: 24, font: fontRegular, color: rgb(0.3, 0.3, 0.3)
        });

        mainCoverPage.drawText(weekText, {
            x: (mmToPt(297) - fontBold.widthOfTextAtSize(weekText, 18)) / 2,
            y: mmToPt(210) - mmToPt(135),
            size: 18, font: fontBold, color: rgb(0.4, 0.4, 0.4)
        });
        pageIndex++;

        for (const [groupKey, groupInspections] of Object.entries(groups)) {
            const [setorNome, localName] = groupKey.split('|');
            const coverPage = pdfDoc.addPage([mmToPt(297), mmToPt(210)]);
            coverPage.drawImage(bgSector, { x: 0, y: 0, width: mmToPt(297), height: mmToPt(210) });
            const sectorWidth = fontBold.widthOfTextAtSize(setorNome, 35);
            coverPage.drawText(setorNome, {
                x: (mmToPt(297) - sectorWidth) / 2,
                y: mmToPt(210) - mmToPt(115),
                size: 35, font: fontBold, color: rgb(0, 0.337, 0.588)
            });
            const localWidth = fontRegular.widthOfTextAtSize(localName, 24);
            coverPage.drawText(localName, {
                x: (mmToPt(297) - localWidth) / 2,
                y: mmToPt(210) - mmToPt(130),
                size: 24, font: fontRegular, color: rgb(0.392, 0.392, 0.392)
            });
            pageIndex++;

            for (const insp of groupInspections) {
                const page = pdfDoc.addPage([mmToPt(297), mmToPt(210)]);
                page.drawImage(bgMain, { x: 0, y: 0, width: mmToPt(297), height: mmToPt(210) });
                const imgBuf = await this.resolveImageBuffer(insp.image);
                if (imgBuf) {
                    try {
                        const img = await pdfDoc.embedJpg(imgBuf).catch(() => pdfDoc.embedPng(imgBuf));
                        page.drawImage(img, { x: mmToPt(31.3), y: mmToPt(210) - mmToPt(42.5) - mmToPt(142), width: mmToPt(88), height: mmToPt(142) });
                    } catch (e) {}
                }
                const xDados = mmToPt(170);
                const wDados = mmToPt(112);
                let currentY = mmToPt(210) - mmToPt(50);
                const seqId = getSeq(insp.id).toString().padStart(5, '0');
                page.drawText(`Apontamento #${seqId}:`, { x: xDados, y: currentY, size: 12, font: fontBold, color: rgb(0, 0.337, 0.588) });
                currentY -= 15;
                currentY = await this.drawText(page, insp.description || 'Não informado', xDados, currentY, { font: fontRegular, size: 10, maxWidth: wDados });
                currentY -= 65;
                page.drawText('Risco/Consequência:', { x: xDados, y: currentY, size: 12, font: fontBold, color: rgb(0, 0.337, 0.588) });
                currentY -= 15;
                const normalizedType = (insp.type || '').trim().toLowerCase();
                let hexColor: string = (typeColors.get(normalizedType) as string) || '#000000';
                hexColor = hexColor.replace(/^#/, '');
                if (hexColor.length === 3) hexColor = hexColor.split('').map(c => c + c).join('');
                const colorInt = parseInt(hexColor || '000000', 16);
                const rCalc = ((colorInt >> 16) & 255) / 255;
                const gCalc = ((colorInt >> 8) & 255) / 255;
                const bCalc = (colorInt & 255) / 255;
                const typeNamePrefix = insp.type ? `${insp.type}: ` : '';
                if (typeNamePrefix) {
                    page.drawText(typeNamePrefix, { x: xDados, y: currentY, size: 10, font: fontBold, color: rgb(rCalc, gCalc, bCalc) });
                }
                const offsetW = typeNamePrefix ? fontBold.widthOfTextAtSize(typeNamePrefix, 10) : 0;
                currentY = await this.drawText(page, insp.risk || 'Não informado', xDados, currentY, { font: fontRegular, size: 10, maxWidth: wDados, initialXOffset: offsetW });
                currentY -= 65;
                page.drawText('Resolução/Ação Tomada:', { x: xDados, y: currentY, size: 12, font: fontBold, color: rgb(0, 0.337, 0.588) });
                currentY -= 15;
                currentY = await this.drawText(page, insp.resolution || 'Não informado', xDados, currentY, { font: fontRegular, size: 10, maxWidth: wDados });
                currentY -= 65;
                page.drawText('Responsável/Prazo:', { x: xDados, y: currentY, size: 12, font: fontBold, color: rgb(0, 0.337, 0.588) });
                currentY -= 15;
                const deadline = insp.deadline ? new Date(insp.deadline).toLocaleDateString('pt-BR') : 'N/A';
                currentY = await this.drawText(page, `${insp.responsible || 'N/A'} - ${deadline}`, xDados, currentY, { font: fontRegular, size: 10, maxWidth: wDados });
                const statusType = insp.status === 'Concluído' ? 'Resolvido' : 'Resolver';
                const statusBuf = await this.resolveBackground(insp.companyId || null, statusType, statusType === 'Resolvido' ? 'Resolvido.png' : 'Resolver.png');
                if (statusBuf) {
                    try {
                        const statusImage = await pdfDoc.embedPng(statusBuf);
                        page.drawImage(statusImage, { x: mmToPt(165), y: mmToPt(210) - mmToPt(182) - mmToPt(17), width: mmToPt(65), height: mmToPt(17) });
                    } catch (e) {}
                }
                page.drawText(`EHS Performance - Semana ${week.toString().padStart(2, '0')} - ${rangeText} - Página ${pageIndex}`, { x: mmToPt(15), y: mmToPt(10), size: 8, font: fontItalicSource, color: rgb(0.39, 0.39, 0.39) });
                pageIndex++;
            }
        }
        return Buffer.from(await pdfDoc.save());
    }

    static async generateInspectionFindingPDF(inspectionId: string) {
        const insp = await prisma.inspection.findUnique({ where: { id: inspectionId } });
        if (!insp) throw new Error('Inspection not found');

        const allInspections = await prisma.inspection.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true }
        });
        const getSeq = (id: string) => {
            const idx = allInspections.findIndex(i => i.id === id);
            return idx === -1 ? 0 : allInspections.length - idx;
        };

        const typeEntries = await prisma.typeOfEntry.findMany();
        const typeColors = new Map(typeEntries.map(t => [(t.name || '').trim().toLowerCase(), t.color]));

        const pdfDoc = await PDFDocument.create();
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontItalicSource = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

        const bgMainBuf = await this.resolveBackground(insp.companyId || insp.companyName || null, 'Findings', 'fundo.jpg');
        const isMainPng = bgMainBuf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
        const bgMain = isMainPng ? await pdfDoc.embedPng(bgMainBuf) : await pdfDoc.embedJpg(bgMainBuf);

        const page = pdfDoc.addPage([mmToPt(297), mmToPt(210)]);
        page.drawImage(bgMain, { x: 0, y: 0, width: mmToPt(297), height: mmToPt(210) });

        const imgBuf = await this.resolveImageBuffer(insp.image);
        if (imgBuf) {
            try {
                const img = await pdfDoc.embedJpg(imgBuf).catch(() => pdfDoc.embedPng(imgBuf));
                page.drawImage(img, { x: mmToPt(31.3), y: mmToPt(210) - mmToPt(42.5) - mmToPt(142), width: mmToPt(88), height: mmToPt(142) });
            } catch (e) {}
        }

        const xDados = mmToPt(170);
        const wDados = mmToPt(112);
        let currentY = mmToPt(210) - mmToPt(50);
        const seqId = getSeq(insp.id).toString().padStart(5, '0');
        page.drawText(`Apontamento #${seqId}:`, { x: xDados, y: currentY, size: 12, font: fontBold, color: rgb(0, 0.337, 0.588) });
        currentY -= 15;
        currentY = await this.drawText(page, insp.description || 'Não informado', xDados, currentY, { font: fontRegular, size: 10, maxWidth: wDados });
        currentY -= 65;
        page.drawText('Risco/Consequência:', { x: xDados, y: currentY, size: 12, font: fontBold, color: rgb(0, 0.337, 0.588) });
        currentY -= 15;
        
        const normalizedType = (insp.type || '').trim().toLowerCase();
        let hexColor: string = (typeColors.get(normalizedType) as string) || '#000000';
        hexColor = hexColor.replace(/^#/, '');
        if (hexColor.length === 3) hexColor = hexColor.split('').map(k => k + k).join('');
        const colorInt = parseInt(hexColor || '000000', 16);
        const rCalc = ((colorInt >> 16) & 255) / 255;
        const gCalc = ((colorInt >> 8) & 255) / 255;
        const bCalc = (colorInt & 255) / 255;
        
        const typeNamePrefix = insp.type ? `${insp.type}: ` : '';
        if (typeNamePrefix) {
            page.drawText(typeNamePrefix, { x: xDados, y: currentY, size: 10, font: fontBold, color: rgb(rCalc, gCalc, bCalc) });
        }
        const offsetW = typeNamePrefix ? fontBold.widthOfTextAtSize(typeNamePrefix, 10) : 0;
        currentY = await this.drawText(page, insp.risk || 'Não informado', xDados, currentY, { font: fontRegular, size: 10, maxWidth: wDados, initialXOffset: offsetW });
        currentY -= 65;
        page.drawText('Resolução/Ação Tomada:', { x: xDados, y: currentY, size: 12, font: fontBold, color: rgb(0, 0.337, 0.588) });
        currentY -= 15;
        currentY = await this.drawText(page, insp.resolution || 'Não informado', xDados, currentY, { font: fontRegular, size: 10, maxWidth: wDados });
        currentY -= 65;
        page.drawText('Responsável/Prazo:', { x: xDados, y: currentY, size: 12, font: fontBold, color: rgb(0, 0.337, 0.588) });
        currentY -= 15;
        const deadline = insp.deadline ? new Date(insp.deadline).toLocaleDateString('pt-BR') : 'N/A';
        currentY = await this.drawText(page, `${insp.responsible || 'N/A'} - ${deadline}`, xDados, currentY, { font: fontRegular, size: 10, maxWidth: wDados });

        const statusType = insp.status === 'Concluído' ? 'Resolvido' : 'Resolver';
        const statusBuf = await this.resolveBackground(insp.companyId || null, statusType, statusType === 'Resolvido' ? 'Resolvido.png' : 'Resolver.png');
        if (statusBuf) {
            try {
                const statusImage = await pdfDoc.embedPng(statusBuf);
                page.drawImage(statusImage, { x: mmToPt(165), y: mmToPt(210) - mmToPt(182) - mmToPt(17), width: mmToPt(65), height: mmToPt(17) });
            } catch (k) {}
        }

        page.drawText(`Notificação de Apontamento - ${insp.companyName || ''} - Gerado em ${new Date().toLocaleDateString('pt-BR')}`, { x: mmToPt(15), y: mmToPt(10), size: 8, font: fontItalicSource, color: rgb(0.39, 0.39, 0.39) });

        return Buffer.from(await pdfDoc.save());
    }

    static async generateActionPlanPDF(actionPlanId: string) {
        const plan = await prisma.actionPlan.findUnique({ where: { id: actionPlanId } });
        if (!plan) throw new Error('Action Plan not found');
        const pdfDoc = await PDFDocument.create();
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

        const bgBuf = await this.resolveBackground(plan.companyId || plan.company || null, 'ActionPlan', 'ActionPlan.png');
        const isPng = bgBuf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
        const bgImg = isPng ? await pdfDoc.embedPng(bgBuf) : await pdfDoc.embedJpg(bgBuf);
        const page = pdfDoc.addPage([mmToPt(297), mmToPt(210)]);
        page.drawImage(bgImg, { x: 0, y: 0, width: mmToPt(297), height: mmToPt(210) });

        const xStart = mmToPt(28); // 3mm left from 31mm
        const pageWidth = mmToPt(297) - xStart - mmToPt(45); // increased right padding
        let yPosData = mmToPt(210) - mmToPt(40);

        const drawStaticLabel = (label: string, value: string, x: number, y: number) => {
            page.drawText(label, { x, y, size: 8, font: fontBold, color: rgb(0, 0.337, 0.588) });
            const labelW = fontBold.widthOfTextAtSize(label, 8);
            const val = String(value || 'N/A');
            page.drawText(val, { x: x + labelW + 1, y, size: 8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        };

        // Header Line 1: Evenly distributed Empresa, Unidade, Setor, Local
        const colWidth = pageWidth / 3.2; // Optimized for better distribution (piling LOCAL more to the left)
        drawStaticLabel('EMPRESA: ', plan.company || 'N/A', xStart, yPosData);
        drawStaticLabel('UNIDADE: ', plan.unit || 'Geral', xStart + colWidth, yPosData);
        drawStaticLabel('SETOR: ', plan.sector || 'N/A', xStart + (colWidth * 2), yPosData);
        drawStaticLabel('LOCAL: ', plan.local || 'N/A', xStart + (colWidth * 3), yPosData);

        // Header Line 2: Apontamento #SEQ - Descrição
        yPosData -= 18; // More spacing 
        let seq = plan.inspectionSequential;
        if (!seq || seq === '0' || seq === 'N/A' || seq === '') {
            // Priority 1: Direct link to Inspection
            if (plan.inspectionId) {
                const allInspections = await prisma.inspection.findMany({
                    orderBy: { createdAt: 'desc' },
                    select: { id: true }
                });
                const idx = allInspections.findIndex(i => i.id === plan.inspectionId);
                if (idx !== -1) {
                    seq = (allInspections.length - idx).toString();
                }
            }
        }
        
        // Priority 2: If still none, calculate position in ActionPlan table for this company
        if (!seq || seq === '0' || seq === 'N/A' || seq === '') {
             const allPlans = await prisma.actionPlan.findMany({
                 where: { company: plan.company || undefined },
                 orderBy: { createdAt: 'asc' },
                 select: { id: true }
             });
             const idx = allPlans.findIndex(p => p.id === plan.id);
             seq = (idx !== -1 ? idx + 1 : 1).toString();
        }
        
        const seqText = `#${seq.padStart(5, '0')} - `;
        page.drawText('APONTAMENTO: ', { x: xStart, y: yPosData, size: 9, font: fontBold, color: rgb(0, 0.337, 0.588) });
        const apLabelW = fontBold.widthOfTextAtSize('APONTAMENTO: ', 9);
        
        page.drawText(seqText, { x: xStart + apLabelW, y: yPosData, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
        const seqW = fontBold.widthOfTextAtSize(seqText, 9);
        
        await this.drawText(page, plan.description || 'Não informado', xStart, yPosData, { 
            font: fontRegular, size: 9, maxWidth: mmToPt(230), initialXOffset: apLabelW + seqW 
        });

        // Add Footer with Action Plan Number and Date
        const createdDate = plan.createdAt ? new Date(plan.createdAt).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
        const footerText = `Plano de Ação #${seq.padStart(5, '0')} - ${createdDate}`;
        page.drawText(footerText, { 
            x: mmToPt(20), 
            y: mmToPt(9), // 2mm down from 11mm
            size: 8, 
            font: fontItalic, 
            color: rgb(0.39, 0.39, 0.39) 
        });

        // Photos Position (Centered relative to the template design)
        const yPhotos = mmToPt(210) - mmToPt(192); // 2mm lower from 188mm
        const photoW = mmToPt(86);
        const photoH = mmToPt(115);

        const beforeBuf = await this.resolveImageBuffer(plan.photoBefore || '');
        if (beforeBuf) {
            try {
                const img = await pdfDoc.embedJpg(beforeBuf).catch(() => pdfDoc.embedPng(beforeBuf));
                page.drawImage(img, { x: mmToPt(31.5), y: yPhotos, width: photoW, height: photoH });
            } catch (e) {}
        }
        
        const afterBuf = await this.resolveImageBuffer(plan.photoAfter || '');
        if (afterBuf) {
            try {
                const img = await pdfDoc.embedJpg(afterBuf).catch(() => pdfDoc.embedPng(afterBuf));
                page.drawImage(img, { x: mmToPt(179.5), y: yPhotos, width: photoW, height: photoH });
            } catch (e) {}
        }

        return Buffer.from(await pdfDoc.save());
    }
}
