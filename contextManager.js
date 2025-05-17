import { analyzeImageFast } from './google-vision.js';
import firebase from './firebaseManager.js';

class ContextManager {
    constructor() {
        this.cache = new Map();
        this.relationshipGraph = new Map();
    }

    // Analisa emojis em uma mensagem
    analyzeEmojis(message) {
        const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu;
        const messageText = typeof message === 'string' ? message : message?.content || '';
        const emojis = messageText.match(emojiRegex) || [];
        return {
            hasEmojis: emojis.length > 0,
            emojis: emojis,
            emojiCount: emojis.length
        };
    }

    // Analisa menções e referências
    analyzeReferences(message, previousMessages) {
        const messageText = typeof message === 'string' ? message : message?.content || '';
        const mentions = messageText.match(/@\w+/g) || [];
        const quotes = previousMessages.filter(prev => 
            messageText.includes(prev.content) || 
            (prev.content && messageText.toLowerCase().includes(prev.content.toLowerCase()))
        );
        return { mentions, quotes };
    }

    // Salva o contexto de uma mensagem
    async saveMessageContext(userId, messageId, context) {
        await firebase.saveMessageContext(userId, messageId, context);
    }

    // Salva o contexto de uma imagem
    async saveImageContext(userId, messageId, imageBuffer, analysis) {
        await firebase.saveMedia(userId, messageId, imageBuffer, 'image', analysis);
    }

    // Obtém o contexto de uma mensagem
    async getMessageContext(userId, messageId) {
        return await firebase.getMessageContext(userId, messageId);
    }

    // Obtém o contexto de uma imagem
    async getImageContext(userId, messageId) {
        return await firebase.getMediaContext(userId, messageId, 'image');
    }

    // Obtém o histórico de contexto do usuário
    async getUserHistory(userId, limit = 10) {
        return await firebase.getUserHistory(userId, limit);
    }

    // Obtém toda a conversa do usuário (memória completa)
    async getFullConversation(userId) {
        return await firebase.getFullConversation(userId);
    }

    // Processa uma nova mensagem
    async processMessage(userId, messageId, message, imageBuffer = null, stickerBuffer = null) {
        const previousMessages = await this.getUserHistory(userId, 20);
        
        // Se tem imagem, processa ela primeiro
        if (imageBuffer) {
            const analysis = await analyzeImageFast(imageBuffer);
            await this.saveImageContext(userId, messageId, imageBuffer, analysis);
            
            // Adiciona relacionamentos com mensagens anteriores
            this.addRelationship(userId, messageId, previousMessages);
            
            return {
                type: 'image',
                analysis,
                messageId,
                relationships: await this.getRelationships(userId, messageId)
            };
        }

        // Processa sticker se existir
        if (stickerBuffer) {
            await this.saveStickerContext(userId, messageId, stickerBuffer);
            return {
                type: 'sticker',
                messageId,
                relationships: await this.getRelationships(userId, messageId)
            };
        }

        // Processa mensagem normal
        const emojiAnalysis = this.analyzeEmojis(message);
        const references = this.analyzeReferences(message, previousMessages);
        
        const context = {
            type: 'text',
            content: message,
            emojis: emojiAnalysis,
            references,
            timestamp: Date.now()
        };

        // Adiciona relacionamentos
        this.addRelationship(userId, messageId, previousMessages);

        await this.saveMessageContext(userId, messageId, context);
        
        // Atualiza cache
        this.updateCache(userId, messageId, context);
        
        return {
            ...context,
            relationships: await this.getRelationships(userId, messageId)
        };
    }

    // Salva o contexto de um sticker
    async saveStickerContext(userId, messageId, stickerBuffer) {
        await firebase.saveMedia(userId, messageId, stickerBuffer, 'sticker');
    }

    // Adiciona relacionamentos entre mensagens
    addRelationship(userId, messageId, previousMessages) {
        const userKey = `${userId}:${messageId}`;
        const relationships = [];

        for (const prev of previousMessages) {
            if (prev.messageId === messageId) continue;
            
            // Verifica relacionamentos baseados em conteúdo
            if (prev.content && prev.content.type === 'text') {
                const similarity = this.calculateTextSimilarity(prev.content.content, messageId);
                if (similarity > 0.5) {
                    relationships.push({
                        type: 'content_similarity',
                        messageId: prev.messageId,
                        score: similarity
                    });
                }
            }
        }

        this.relationshipGraph.set(userKey, relationships);
    }

    // Calcula similaridade entre textos (implementação básica)
    calculateTextSimilarity(text1, text2) {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        return intersection.size / union.size;
    }

    // Obtém relacionamentos de uma mensagem
    async getRelationships(userId, messageId) {
        const userKey = `${userId}:${messageId}`;
        return this.relationshipGraph.get(userKey) || [];
    }

    // Atualiza o cache
    updateCache(userId, messageId, context) {
        const key = `${userId}:${messageId}`;
        this.cache.set(key, {
            context,
            timestamp: Date.now()
        });

        // Limpa cache antigo (mais de 1 hora)
        const hour = 60 * 60 * 1000;
        for (const [key, value] of this.cache.entries()) {
            if (Date.now() - value.timestamp > hour) {
                this.cache.delete(key);
            }
        }
    }
}

const contextManager = new ContextManager();
export default contextManager;
