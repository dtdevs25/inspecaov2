import { API_URL, getAuthHeaders } from '../lib/dbBridge';

export interface CorrectionContext {
  apontamento?: string;
  risco?: string;
  resolucao?: string;
  observacoes?: string;
  description?: string;
}

export const correctText = async (
  field: 'apontamento' | 'risco' | 'resolucao' | 'observacoes' | 'description' | 'observations',
  text: string,
  context: CorrectionContext,
  module?: string
) => {
  if (!text.trim()) return text;

  try {
    const res = await fetch(`${API_URL}/api/gemini/correct`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ field, text, context, module })
    });
    
    if (!res.ok) throw new Error("Failed to fetch from backend");
    
    const data = await res.json();
    return data.correctedText || text;
  } catch (error) {
    console.error("Erro ao corrigir texto com Gemini via API:", error);
    return text;
  }
};
