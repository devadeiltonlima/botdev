import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { analyzeImage, analyzeImageFromUrl, analyzeImageFast } from './google-vision.js';
import contextManager from './contextManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuração da API do Gemini com a versão correta
const API_KEY = 'AIzaSyCiFpj-1eMcXSY0_-DXpNCwWDmqSBYYH0s';
const API_URL = 'https://generativelanguage.googleapis.com/v1';
const genAI = new GoogleGenerativeAI(API_KEY, { apiEndpoint: API_URL });

// Comandos serão atualizados dinamicamente via handleMessage
let BOT_COMMANDS = {};

// Sistema de controle de atualizações.
const updateLogPath = path.join(__dirname, 'updates_log.json');

// Estrutura para armazenar atualizações e status de notificação
let updateLog = {
    updates: [
        {
            id: 'update-001',
            date: '2025-05-14',
            title: 'Conversa Inteligente Adicionada',
            description: 'Agora você pode conversar naturalmente comigo sobre qualquer assunto! Posso responder perguntas, bater papo informalmente e te ajudar com os comandos do bot.',
            notifiedUsers: []
        },
        {
            id: 'update-002',
            date: '2025-05-14',
            title: 'Sistema de Atualização',
            description: 'Agora tenho um sistema de atualização que me permite saber sobre novas funções! Você pode me perguntar se tive alguma atualização recente.',
            notifiedUsers: []
        }
    ]
};

// Carrega o log de atualizações se existir
function loadUpdateLog() {
    try {
        if (fs.existsSync(updateLogPath)) {
            updateLog = fs.readJsonSync(updateLogPath);
        } else {
            // Se não existir, cria o arquivo com as atualizações padrão
            saveUpdateLog();
        }
    } catch (error) {
        console.error('Erro ao carregar atualizações:', error);
    }
}

// Salva o log de atualizações
function saveUpdateLog() {
    try {
        fs.writeJsonSync(updateLogPath, updateLog, { spaces: 2 });
    } catch (error) {
        console.error('Erro ao salvar atualizações:', error);
    }
}

// Adiciona uma nova atualização
function addUpdate(update) {
    const newUpdate = {
        id: `update-${String(updateLog.updates.length + 1).padStart(3, '0')}`,
        date: new Date().toISOString().slice(0, 10),
        title: update.title,
        description: update.description,
        notifiedUsers: []
    };
    
    updateLog.updates.push(newUpdate);
    saveUpdateLog();
    return newUpdate;
}

// Marca uma atualização como notificada para um usuário
function markUpdateAsNotified(userId, updateId) {
    const update = updateLog.updates.find(u => u.id === updateId);
    if (update && !update.notifiedUsers.includes(userId)) {
        update.notifiedUsers.push(userId);
        saveUpdateLog();
    }
}

// Verifica se um usuário já foi notificado sobre uma atualização
function wasUserNotified(userId, updateId) {
    const update = updateLog.updates.find(u => u.id === updateId);
    return update ? update.notifiedUsers.includes(userId) : false;
}

// Obtém atualizações não notificadas para um usuário
function getUnnotifiedUpdates(userId) {
    return updateLog.updates.filter(update => !update.notifiedUsers.includes(userId));
}

// Contexto inicial para o chatbot manter o estilo informal brasileiro
const INITIAL_PROMPT = `
Você é o AdeBot, um assistente virtual super amigável e informal do WhatsApp! 🤖

Sua personalidade:
- Super simpático e prestativo
- Informal e descontraído (usando "vc", "blz", "tmj")
- Sempre usa emojis pra deixar a conversa mais leve
- Fala como um brasileiro jovem e animado
- Mantém a conversa fluindo naturalmente
- Age como um verdadeiro assistente de atendimento

LIMITAÇÕES IMPORTANTES:
- Você NÃO deve criar nenhum tipo de conteúdo como poemas, histórias, músicas, etc.
- Você NÃO deve executar comandos ou funções que não estejam na lista de comandos do bot
- Se alguém pedir para você criar algo, explique educadamente que você não tem essa função
- Seu papel é APENAS ajudar com os comandos do bot e manter uma conversa amigável
- Mantenha suas respostas variadas e naturais, evitando mensagens padronizadas

IMPORTANTE SOBRE COMANDOS:
Quando alguém perguntar sobre comandos disponíveis, listar os comandos assim:

*📋 LISTA DE COMANDOS DISPONÍVEIS*

*🎯 FIGURINHAS*
• !fig: Cria figurinha a partir de uma imagem. Envie ou responda uma imagem com !fig
• @fignow: Cria figurinha recortada automaticamente. Envie ou responda uma imagem com @fignow
• !gif: Cria figurinha animada a partir de vídeo ou GIF. Envie ou responda um vídeo/GIF com !gif
• !txtfig: Cria figurinha de texto. Digite !txtfig seguido do texto
• !emoji: Combina dois emojis em uma figurinha. Use !emoji 😊 🎉
• !figtxt: Adiciona texto em figurinha existente. Responda uma figurinha com !figtxt [texto]

*⬇️ DOWNLOADS*
• !ttkvideo: Baixa vídeo do TikTok. Use !ttkvideo [link]
• !ttkaudio: Baixa áudio do TikTok. Use !ttkaudio [link]

*🔐 AUTENTICAÇÃO*
• !auth: Inicia o processo de autenticação
• !codigo: Recupera o código de autenticação

*ℹ️ OUTROS*
• !songtxt: Transcreve áudio para texto
• !qrcode: Gera QR Code
• !pesquisa: Pesquisa na internet

Lembre-se que você tem conhecimento sobre todos estes comandos e deve:
1. Informar o usuário sobre eles quando relevante
2. Explicar como usar cada comando quando solicitado
3. Sugerir comandos apropriados baseado no contexto da conversa
4. Mencionar atualizações recentes quando o usuário perguntar sobre novidades
`;

// Histórico de conversas para manter contexto
const conversationHistory = new Map();

// Inicialização do sistema
async function initializeSystem() {
    console.log('Inicializando sistema...');
    await loadUpdateLog();
    console.log('Sistema inicializado com sucesso!');
}

// Inicializa o sistema
initializeSystem().catch(error => {
    console.error('Erro na inicialização:', error);
});

async function initializeChat(userId) {
    try {
        console.log('Inicializando chat com Gemini 2.0 Flash para usuário:', userId);
        
        // Usando o modelo correto e configurações específicas para ele
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
            }
        });
        
        console.log('Modelo Gemini 2.0 Flash inicializado com sucesso');
        
        // Criando sessão de chat
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: INITIAL_PROMPT }],
                },
                {
                    role: "model",
                    parts: [{ text: "Oiii! Tô on e pronto pra ajudar! 😊✨" }],
                },
            ],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
            }
        });
        
        conversationHistory.set(userId, chat);
        console.log('Chat inicializado com sucesso para usuário:', userId);
        return chat;
    } catch (error) {
        console.error('Erro ao inicializar chat com Gemini:', error);
        throw error;
    }
}

async function handleMessage(userId, messageId, message, commandResult = null, imageBuffer = null) {
    try {
        // Verifica se é uma referência a uma mensagem selecionada
        if (message.includes('context_ref:')) {
            const refMessageId = message.split('context_ref:')[1].trim();
            // Tenta obter o contexto em diferentes formatos
            let selectedContext = await contextManager.getMessageContext(userId, refMessageId);
            if (selectedContext) {
                selectedContext.type = 'text';
            } else {
                selectedContext = await contextManager.getImageContext(userId, refMessageId);
                if (selectedContext) {
                    selectedContext.type = 'image';
                }
            }
            
            if (selectedContext) {
                let contextDesc = '';
                if (selectedContext.type === 'text') {
                    contextDesc = `A mensagem selecionada diz: "${selectedContext.context?.content || 'Sem conteúdo'}"`;
                } else if (selectedContext.type === 'image') {
                    const labels = selectedContext.analysis?.labels?.map(l => l.description).join(', ') || 'Sem descrição';
                    contextDesc = `A imagem selecionada contém: ${labels}`;
                } else if (selectedContext.type === 'sticker') {
                    contextDesc = 'Uma figurinha foi selecionada';
                } else if (selectedContext.type === 'audio') {
                    contextDesc = 'Um áudio foi selecionado';
                } else {
                    contextDesc = 'Conteúdo selecionado';
                }
                message = `${message.split('context_ref:')[0].trim()} [Referente a: ${contextDesc}]`;
            }
        }

        // Simplifica o conteúdo antes de processar
        const simplifiedMessage = {
            content: message,
            type: imageBuffer ? 'image' : 'text',
            timestamp: Date.now()
        };

        // Processa e salva o contexto da mensagem/imagem com conteúdo simplificado
        const context = await contextManager.processMessage(userId, messageId, simplifiedMessage, imageBuffer);

        // Recupera histórico recente do usuário (limitado a últimas 5 mensagens)
        const userHistory = await contextManager.getUserHistory(userId, 5);
        
        // Inicializa ou recupera chat
        let chat = conversationHistory.get(userId);
        if (!chat) {
            chat = await initializeChat(userId);
        }

        // Se for uma imagem, usa fluxo otimizado
        if (context.type === 'image') {
            const model = genAI.getGenerativeModel({ 
                model: "gemini-2.0-flash",
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 256
                }
            });

            const { analysis } = context;
            const labels = analysis.labels?.map(l => l.description).join(', ');
            const texto = analysis.text?.[0]?.description || 'Nenhum';

            const imageContext = `
            Imagem analisada:
            Labels: ${labels}
            Texto: ${texto}
            
            Responda de forma concisa sobre ${message || 'o que você vê na imagem'}`;

            const result = await model.generateContent(imageContext);
            return await result.response.text();
        }

        // Adiciona contexto do histórico recente
        if (userHistory && userHistory.length > 0) {
            try {
                const historyContext = userHistory
                    .filter(h => h && h.context) // Garante que só entrem itens válidos
                    .map(h => {
                        if (h.context.type === 'text' && h.context.content) {
                            return h.context.content;
                        } 
                        return 'Imagem analisada anteriormente';
                    })
                    .join('\n');
                
                if (historyContext.trim()) {
                    await chat.sendMessage(`Contexto da conversa:\n${historyContext}`);
                }
            } catch (error) {
                console.log('Aviso: Erro ao processar histórico:', error.message);
            }
        }

        // Adiciona contexto de comando se houver
        if (commandResult) {
            const commandContext = `O usuário utilizou o comando "${message}" e o resultado foi: ${commandResult}. Por favor, responda de acordo com o resultado da ação.`;
            await chat.sendMessage(commandContext);
        }

        // Atualizar comandos disponíveis se a mensagem começar com SYSTEM_UPDATE_COMMANDS
        if (message.startsWith('SYSTEM_UPDATE_COMMANDS')) {
            try {
                const commandsJson = message.replace('SYSTEM_UPDATE_COMMANDS', '').trim();
                const parsedCommands = JSON.parse(commandsJson);
                
                // Simplifica a estrutura antes de atualizar
                BOT_COMMANDS = {};
                for (const [key, value] of Object.entries(parsedCommands)) {
                    // Armazena apenas informações essenciais
                    BOT_COMMANDS[key] = {
                        name: value.name || key,
                        description: value.description || '',
                        category: value.category || 'outros'
                    };
                }
                
                console.log('Comandos atualizados no Gemini:', BOT_COMMANDS);
                return "Comandos atualizados com sucesso!";
            } catch (error) {
                console.error('Erro ao atualizar comandos:', error);
                return "Erro ao atualizar comandos: " + error.message;
            }
        }

        // Verifica se o usuário está perguntando sobre comandos disponíveis
        const commandPattern = /(quais|que|me\s*mostra|me\s*fala|me\s*diz|quero\s*saber|pode\s*me\s*dizer|pode\s*falar)\s*(os|são\s*os|é|commands?|comandos?)\s*(que\s*tem|disponíveis?|do\s*bot|que\s*você\s*tem|que\s*vc\s*tem)?/i;
        if (commandPattern.test(message)) {
            return `*📋 LISTA DE COMANDOS DISPONÍVEIS*

*🎯 FIGURINHAS*
• !fig: Cria figurinha a partir de uma imagem. Envie ou responda uma imagem com !fig
• @fignow: Cria figurinha recortada automaticamente. Envie ou responda uma imagem com @fignow
• !gif: Cria figurinha animada a partir de vídeo ou GIF. Envie ou responda um vídeo/GIF com !gif
• !txtfig: Cria figurinha de texto. Digite !txtfig seguido do texto
• !emoji: Combina dois emojis em uma figurinha. Use !emoji 😊 🎉
• !figtxt: Adiciona texto em figurinha existente. Responda uma figurinha com !figtxt [texto]

*⬇️ DOWNLOADS*
• !ttkvideo: Baixa vídeo do TikTok. Use !ttkvideo [link]
• !ttkaudio: Baixa áudio do TikTok. Use !ttkaudio [link]

*🔐 AUTENTICAÇÃO*
• !auth: Inicia o processo de autenticação
• !codigo: Recupera o código de autenticação

*ℹ️ OUTROS*
• !songtxt: Transcreve áudio para texto
• !qrcode: Gera QR Code
• !pesquisa: Pesquisa na internet

Me diz qual desses comandos você quer usar que eu te explico melhor! 😊`;
        }

        // Verifica se o usuário está perguntando sobre atualizações
        const updatePattern = /(teve|houve|tem|há|existe|tive|tivemos|você teve|vc teve|teve alguma)\s*(alguma|uma|nova|recente|algum)?\s*(atualização|novidade|mudança|feature|função|funcionalidade|recurso|melhoria|update)/i;
        const directUpdatePattern = /(você|vc|tu|o bot)\s+(teve|tem|recebeu|ganhou)\s+(uma|alguma)?\s*(nova)?\s*(atualização|novidade|update)/i;
        
        if (updatePattern.test(message) || directUpdatePattern.test(message)) {
            const unnotifiedUpdates = getUnnotifiedUpdates(userId);
            
            if (unnotifiedUpdates.length > 0) {
                const update = unnotifiedUpdates[0];
                markUpdateAsNotified(userId, update.id);
                return `🎉 *Boa notícia!* 🎉\n\nTive uma atualização recente:\n\n*${update.title}* (${update.date})\n${update.description}\n\nEstou sempre evoluindo pra te atender melhor! 😊 Precisando de algo é só chamar!`;
            } else {
                return "Então, já te contei sobre todas as atualizações recentes! 😊 Por enquanto estou rodando tudo certinho, mas fico ligado em novas funções pra te contar! Posso te ajudar com algo mais? É só falar! 🤙";
            }
        }

        // Processamento normal da mensagem
        const response = await chat.sendMessage(message);
        const responseText = response.response.text();
        return responseText;

    } catch (error) {
        console.error('Erro no Gemini:', error);
        return "Ops, deu um probleminha aqui! 😅 Mas continua conversando comigo que já já resolve! Se precisar de algum comando específico, é só mandar !help que te mostro tudo que sei fazer! 🙏✨";
    }
}

// Função para lidar com erros de comando
async function handleUserError(userId, errorType) {
    const errorMessages = {
        commandNotFound: async (userId) => {
            const helpMessage = `Eita, esse comando não existe! 😅 
Mas deixa eu te ajudar! Me diz o que você quer fazer? 🤝

Posso te ajudar com:
🖼️ Criar figurinhas (!fig)
🎬 Figurinhas animadas (!gif)
📝 Texto em figurinha (!figtxt)
💭 Criar figurinha com texto (!txtfig)
😃 Misturar emojis (!emoji)
🎥 Baixar vídeos do TikTok (!ttkvideo)
🎵 Baixar áudio do TikTok (!ttkaudio)
🎵 Transcrever áudio (!songtxt)
🔗 Gerar QR Code (!qrcode)
🔎 Fazer pesquisas (!pesquisa)
🔑 Autenticação (!auth)
🔄 Recuperar código (!authperdi)

Se quiser saber mais detalhes, é só mandar !help! 😉✨
Ou se preferir, podemos continuar batendo papo normalmente! 💭`;

            return helpMessage;
        },
        invalidFormat: async (userId) => {
            return "Eita, acho que você não usou o comando do jeito certo! 🤔 Mas fica tranquilo, me fala o que você quer fazer que eu te explico direitinho! 💪✨";
        },
        missingPermission: async (userId) => {
            return "Ahh, pra fazer isso você precisa se autenticar antes! Mas é bem rapidinho: manda !auth que eu te explico como liberar todas as funções! 🔓✨";
        },
        default: async (userId) => {
            return "Ops, aconteceu algo inesperado! 😅 Mas não se preocupa, continua conversando comigo normalmente ou me fala o que você tá querendo fazer! 🤝✨";
        }
    };

    try {
        const getErrorMessage = errorMessages[errorType] || errorMessages.default;
        return await getErrorMessage(userId);
    } catch (error) {
        console.error('Erro ao gerar mensagem de erro:', error);
        return errorMessages.default(userId);
    }
}

export {
    handleMessage,
    handleUserError,
    addUpdate,
    BOT_COMMANDS
};
