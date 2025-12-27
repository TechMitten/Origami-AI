
interface LLMSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const transformText = async (settings: LLMSettings, text: string): Promise<string> => {
  const systemPrompt = `Transform the following slide text into a complete, natural-sounding script suitable for Text-to-Speech.
The original text is often fragmented (titles, bullets, metadata) and needs to be connected into coherent sentences.
Do not hallucinate new facts, but strictly "connect the dots" or "fill in the blanks" to make it flow well.
IMPORTANT: Return ONLY the transformed text. Do not wrap the output in quotation marks.

Example Input:
" How to Install Visual Studio Code on Windows A Complete Beginner's Guide Step-by-Step Instructions for First-Time Users  Windows 10/11  ~5 Minutes  Free & Open Source"

Example Output:
How to Install Visual Studio Code on Windows. This is a Complete Beginner's Guide including step-by-Step Instructions designed for First-Time Users. This guide is compatible with Windows 10 or Windows 11 operating systems. It will take around 5 minutes to complete. Visual Studio Code is free and open-source software.`;

  const userPrompt = `Input Text:
"${text}"`;

  let endpoint = settings.baseUrl;
  // Ensure we hit the chat completions endpoint if not provided
  if (!endpoint.endsWith('/chat/completions')) {
     // Remove trailing slash if present
     endpoint = endpoint.replace(/\/+$/, '');
     endpoint = `${endpoint}/chat/completions`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Failed to generate content: ${response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content || '';
    
    // Remove any leading/trailing quotes that might have slipped through
    return textContent.replace(/^["']|["']$/g, '').trim();
  } catch (error) {
    console.error('LLM API Error:', error);
    throw error;
  }
};
