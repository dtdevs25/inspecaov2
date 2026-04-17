export const uploadFile = async (file: File, bucket: string): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucket', bucket);

  const token = localStorage.getItem('token');
  const apiUrl = (import.meta as any).env.VITE_API_URL || '';
  
  const endpoint = token ? `${apiUrl}/api/upload` : `${apiUrl}/api/public-upload`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: token ? {
      'Authorization': `Bearer ${token}`
    } : {},
    body: formData
  });

  if (!response.ok) {
    let errorMessage = 'Erro ao realizar upload do arquivo';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      console.error(e);
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.url;
};
