const ContextManager = require('../contextManager');
const fs = require('fs-extra');
const path = require('path');

describe('ContextManager', () => {
    let contextManager;
    const testUserId = 'test-user';
    const testMessageId = 'test-message';

    beforeEach(() => {
        contextManager = new ContextManager();
    });

    afterEach(async () => {
        // Limpa diretórios de teste
        await fs.remove(path.join(__dirname, '..', 'data', 'context'));
    });

    describe('Análise de Emojis', () => {
        test('Deve detectar emojis corretamente', () => {
            const message = 'Olá 👋 Tudo bem? 😊';
            const analysis = contextManager.analyzeEmojis(message);
            expect(analysis.hasEmojis).toBe(true);
            expect(analysis.emojis).toHaveLength(2);
            expect(analysis.emojiCount).toBe(2);
        });

        test('Deve retornar vazio quando não há emojis', () => {
            const message = 'Olá! Tudo bem?';
            const analysis = contextManager.analyzeEmojis(message);
            expect(analysis.hasEmojis).toBe(false);
            expect(analysis.emojis).toHaveLength(0);
        });
    });

    describe('Processamento de Mensagens', () => {
        test('Deve processar mensagem com texto corretamente', async () => {
            const message = 'Teste de mensagem';
            const result = await contextManager.processMessage(testUserId, testMessageId, message);
            expect(result.type).toBe('text');
            expect(result.content).toBe(message);
            expect(result.emojis).toBeDefined();
            expect(result.references).toBeDefined();
        });

        test('Deve processar imagem corretamente', async () => {
            const imageBuffer = Buffer.from('fake image data');
            const result = await contextManager.processMessage(testUserId, testMessageId, null, imageBuffer);
            expect(result.type).toBe('image');
            expect(result.messageId).toBe(testMessageId);
        });

        test('Deve processar sticker corretamente', async () => {
            const stickerBuffer = Buffer.from('fake sticker data');
            const result = await contextManager.processMessage(testUserId, testMessageId, null, null, stickerBuffer);
            expect(result.type).toBe('sticker');
            expect(result.messageId).toBe(testMessageId);
        });
    });

    describe('Relacionamentos entre Mensagens', () => {
        test('Deve detectar relacionamentos baseados em conteúdo', async () => {
            // Primeira mensagem
            await contextManager.processMessage(testUserId, 'msg1', 'Olá, como vai você?');
            
            // Segunda mensagem relacionada
            const result = await contextManager.processMessage(testUserId, 'msg2', 'Oi, eu vou bem, como vai você?');
            
            const relationships = await contextManager.getRelationships(testUserId, 'msg2');
            expect(relationships).toBeDefined();
            expect(relationships.length).toBeGreaterThan(0);
        });
    });

    describe('Cache', () => {
        test('Deve armazenar e recuperar do cache corretamente', async () => {
            const message = 'Teste de cache';
            await contextManager.processMessage(testUserId, testMessageId, message);
            
            const key = `${testUserId}:${testMessageId}`;
            const cached = contextManager.cache.get(key);
            expect(cached).toBeDefined();
            expect(cached.context.content).toBe(message);
        });

        test('Deve limpar cache antigo', async () => {
            const message = 'Teste de cache';
            await contextManager.processMessage(testUserId, testMessageId, message);
            
            const key = `${testUserId}:${testMessageId}`;
            const cached = contextManager.cache.get(key);
            
            // Simula passagem de tempo
            cached.timestamp = Date.now() - (61 * 60 * 1000); // 61 minutos
            contextManager.updateCache(testUserId, 'novo-id', { content: 'nova mensagem' });
            
            expect(contextManager.cache.get(key)).toBeUndefined();
        });
    });
});
