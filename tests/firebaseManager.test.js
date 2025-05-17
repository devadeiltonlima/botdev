import firebase from '../firebaseManager.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testFirebaseIntegration() {
    try {
        // Teste de salvamento de mensagem
        const testMessage = {
            type: 'text',
            content: 'Teste de integração Firebase',
            timestamp: Date.now()
        };
        
        console.log('Testando salvamento de mensagem...');
        await firebase.saveMessageContext('test-user', 'msg-1', testMessage);
        
        // Teste de recuperação de mensagem
        console.log('Testando recuperação de mensagem...');
        const savedMessage = await firebase.getMessageContext('test-user', 'msg-1');
        console.log('Mensagem recuperada:', savedMessage);

        // Teste de salvamento de imagem
        console.log('Testando salvamento de imagem...');
        const imageBuffer = Buffer.from('Teste de imagem');
        const imageMetadata = {
            type: 'image/jpeg',
            size: imageBuffer.length,
            description: 'Imagem de teste'
        };
        
        await firebase.saveMedia('test-user', 'img-1', imageBuffer, 'image', imageMetadata);
        
        // Teste de recuperação de imagem
        console.log('Testando recuperação de imagem...');
        const savedImage = await firebase.getMediaContext('test-user', 'img-1', 'image');
        console.log('Metadados da imagem:', savedImage);

        // Teste de histórico
        console.log('Testando recuperação de histórico...');
        const history = await firebase.getUserHistory('test-user', 5);
        console.log('Histórico:', history);

        console.log('\nTodos os testes completados com sucesso!');
    } catch (error) {
        console.error('Erro durante os testes:', error);
    }
}

testFirebaseIntegration();
