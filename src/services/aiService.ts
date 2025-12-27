
export const transformText = async (apiKey: string, text: string): Promise<string> => {
const prompt = `Transform the following slide text into a complete, natural-sounding script suitable for Text-to-Speech.
The original text is often fragmented (titles, bullets, metadata) and needs to be connected into coherent sentences.
Do not hallucinate new facts, but strictly "connect the dots" or "fill in the blanks" to make it flow well.
IMPORTANT: Return ONLY the transformed text. Do not wrap the output in quotation marks.

Example Input:
" How to Install Visual Studio Code on Windows A Complete Beginner's Guide Step-by-Step Instructions for First-Time Users  Windows 10/11  ~5 Minutes  Free & Open Source"

Example Output:
How to Install Visual Studio Code on Windows. This is a Complete Beginner's Guide including step-by-Step Instructions designed for First-Time Users. This guide is compatible with Windows 10 or Windows 11 operating systems. It will take around 5 minutes to complete. Visual Studio Code is free and open-source software.

Input Text:
"${text}"
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to generate content');
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Remove any leading/trailing quotes that might have slipped through
    return textContent.replace(/^["']|["']$/g, '').trim();
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
};
