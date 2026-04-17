import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.meuservidor.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true para porta 465, false para outras
    auth: {
        user: process.env.SMTP_USER || 'contato@meudominio.com',
        pass: process.env.SMTP_PASS || 'senha_segura'
    }
});

export const sendEmail = async (to: string, subject: string, text: string, html?: string, attachments?: any[]) => {
    try {
        const toList = to.split(',').map(e => e.trim()).filter(Boolean);
        const mailOptions: any = {
            from: {
                name: 'InspecPRO',
                address: process.env.SMTP_USER || 'contato@meudominio.com'
            },
            subject,
            text,
            html: html || text,
            attachments
        };

        if (toList.length > 1) {
            mailOptions.to = process.env.SMTP_USER || 'nreply@inspecaopro.com';
            mailOptions.bcc = toList;
        } else {
            mailOptions.to = to;
        }

        const info = await transporter.sendMail(mailOptions);
        
        console.log('E-mail enviado:', info.messageId);
        return true;
    } catch (error) {
        console.error('Erro ao enviar o e-mail:', error);
        return false;
    }
};
