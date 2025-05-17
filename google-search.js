import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

// Configurações das APIs
const GOOGLE_SEARCH_API_KEY = 'AIzaSyChgBZwYx-i6VmFLRa5xCKjc7bt1RnREtg';
const SEARCH_ENGINE_ID = 'd522136ac20404be2';
const GEMINI_API_KEY = 'AIzaSyCiFpj-1eMcXSY0_-DXpNCwWDmqSBYYH0s';

// Inicializar Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function realizarPesquisa(query) {
    try {
        // Fazer pesquisa no Google
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl);
        
        // Extrair resultados relevantes
        const items = response.data.items || [];
        const resultados = items.slice(0, 3).map(item => ({
            titulo: item.title,
            descricao: item.snippet,
            link: item.link
        }));

        // Criar prompt para o Gemini
        const prompt = `
        Com base nestes resultados de pesquisa sobre "${query}":
        ${resultados.map(r => `
        Título: ${r.titulo}
        Descrição: ${r.descricao}
        Link: ${r.link}
        `).join('\n')}
        
        Por favor, crie um resumo detalhado em português brasileiro, usando linguagem informal e descontraída. 
        Mantenha um tom amigável e use emojis ocasionalmente. 
        Inclua os links relevantes no final.
        `;

        // Processar com Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        const response_text = result.response.text();

        return response_text;

    } catch (error) {
        console.error('Erro na pesquisa:', error);
        return "Opa! Deu um probleminha na pesquisa 😅 Tenta de novo ou me pergunta de outro jeito! 🤔";
    }
}

// Função para processar o comando !pesquisa
async function handlePesquisaCommand(message) {
    // Remove o comando !pesquisa e espaços extras
    const query = message.replace(/^!pesquisa\s+/, '').trim();
    
    if (!query) {
        return "Ei! Me diz o que você quer pesquisar! 😊\nExemplo: !pesquisa como fazer bolo de chocolate";
    }

    return await realizarPesquisa(query);
}

export {
    handlePesquisaCommand
};
