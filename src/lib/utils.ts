import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  const apiUrl = (import.meta as any).env.VITE_API_URL || '';
  
  // Force ALL MinIO / Storage URLs (internal or public) to use our local Backend Proxy.
  // This bypasses any strict MinIO CORS, Bucket Public Policies or double slash API errors.
  if (
    url.includes('srv-captain--minio') || 
    url.includes('storage-api.ehspro.com.br') || 
    url.includes('storage.ehspro.com.br') ||
    url.includes('minio-api.manager.ehspro.com.br') ||
    url.includes('localhost:9000')
  ) {
    try {
      // Regex para extrair o bucket e nome do arquivo da URL (ex: .../logo-empresa/nome.png)
      // O bucket deve ser uma das constantes conhecidas ou extraido dinamico
      const parts = url.split('?')[0].split('/');
      const validParts = parts.filter(p => p.length > 0);
      
      const fileName = validParts.pop() || '';
      const possibleBucket = validParts.pop() || '';
      
      // Mapeamento seguro de buckets conhecidos caso a URL tenha prefixos como '/browser/...'
      let bucketName = possibleBucket;
      if (url.includes('logo-empresa')) bucketName = 'logo-empresa';
      if (url.includes('foto-inspecao')) bucketName = 'foto-inspecao';
      if (url.includes('foto-planodeacao')) bucketName = 'foto-planodeacao';
      
      // Usa o proxy local por padrão para suportar CORS e acesso sem auth, 
      // ou se quiser link público, não deve usar /browser/. 
      // Append auth token as query param for secured proxy access in <img> tags
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const authQuery = token ? `?token=${token}` : '';
      
      return `${apiUrl}/api/files/${bucketName}/${fileName}${authQuery}`;
    } catch {
      return url;
    }
  }
  
  // Clean double slashes causing BadRequest in Minio (e.g. https://storage-api.com//bucket/ => https://storage-api.com/bucket/)
  // Use a regex that replaces multiple slashes with a single one, while preserving 'http://' or 'https://'
  let cleanUrl = url.replace(/([^:]\/)\/+/g, "$1");
  
  if (cleanUrl.startsWith('/api/')) {
    // Evita forçar localhost se estiver rodando num domínio público,
    // que causaria erro de Mixed Content (HTTPS -> HTTP) e imagem quebrada.
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const authQuery = token ? (cleanUrl.includes('?') ? `&token=${token}` : `?token=${token}`) : '';
      if (apiUrl && !apiUrl.includes('localhost') && !apiUrl.includes('127.0.0.1')) {
        return `${apiUrl}${cleanUrl}${authQuery}`;
      }
      // Como o front-end Node do CapRover serve a API e o React juntos,
      // o caminho relativo puro `/api/...` garante que a imagem carregue na raiz correta.
      return `${cleanUrl}${authQuery}`;
  }
  
  return cleanUrl;
}

/**
 * Comprime uma imagem no lado do cliente antes do upload.
 * Redimensiona para um máximo de 1600px e ajusta a qualidade para 80%.
 */
export const compressImage = (file: File, maxWidth = 3840, maxHeight = 3840, quality = 0.95): Promise<File> => {
  return new Promise((resolve, reject) => {
    // Only compress images
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions maintain aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not get canvas context'));
        
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              reject(new Error('Canvas to Blob failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};
