export const prerender = false;

export async function POST({ request }: { request: Request }) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Prompt inválido ou não fornecido" }), { status: 400 });
    }

    const apiKey = import.meta.env.GEMINI_API_KEY; // Pegando a chave do .env
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API Gemini: ${response.statusText}`);
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/```json|```/g, "").trim();

    console.log("data", rawContent);

    if (!rawContent) {
      throw new Error("Resposta inválida do Gemini");
    }

    return new Response(rawContent, { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
}
