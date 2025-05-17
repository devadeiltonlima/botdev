import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { cert } from 'firebase-admin/app';
import fs from 'fs';

// Função para obter credenciais do Firebase
function getFirebaseCredentials() {
    // Opção 1: Verificar variável de ambiente (para Railway)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            console.log("[Firebase] Credenciais carregadas da variável de ambiente");
            return credentials;
        } catch (error) {
            console.error("[Firebase] Erro ao analisar FIREBASE_SERVICE_ACCOUNT:", error);
        }
    }
    
    // Opção 2: Tentar carregar do arquivo local
    try {
        const credentials = JSON.parse(fs.readFileSync('./firebase-service-account.json', 'utf8'));
        console.log("[Firebase] Credenciais carregadas do arquivo local");
        return credentials;
    } catch (error) {
        console.error("[Firebase] Erro ao carregar arquivo local:", error.message);
    }
    
    // Se chegou aqui, não foi possível obter credenciais
    throw new Error("Não foi possível obter credenciais do Firebase. Configure a variável de ambiente FIREBASE_SERVICE_ACCOUNT ou adicione o arquivo firebase-service-account.json");
}

// Obter credenciais do Firebase
let serviceAccount;
try {
    serviceAccount = getFirebaseCredentials();
    console.log(`[Firebase] Credenciais carregadas com sucesso para projeto: ${serviceAccount.project_id}`);
} catch (error) {
    console.error("[Firebase] ERRO FATAL AO CARREGAR CREDENCIAIS:", error);
    throw error;
}

class FirebaseManager {
    constructor() {
        // Verifica se a variável de ambiente do storage bucket está definida
        if (!process.env.FIREBASE_STORAGE_BUCKET) {
            throw new Error("[Firebase] FIREBASE_STORAGE_BUCKET não está definido nas variáveis de ambiente");
        }

        // Inicializa com credenciais de serviço
        const app = initializeApp({
            credential: cert(serviceAccount),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        });
        
        this.db = getFirestore();
        this.storage = getStorage();
        this.bucket = this.storage.bucket();
        
        // Lista de coleções já verificadas (para evitar verificações repetidas)
        this.existingCollections = new Set();
    }
    
    // Método para verificar se coleção existe e criar se não existir
    async ensureCollectionExists(userId) {
        // Se já verificamos essa coleção antes, não precisamos verificar novamente
        if (this.existingCollections.has(userId)) return;
        
        try {
            // Verifica se a coleção já existe
            const collections = await this.db.listCollections();
            const collectionExists = collections.some(col => col.id === userId);
            
            if (!collectionExists) {
                // Criamos pelo menos um documento para garantir que a coleção exista
                await this.db.collection(userId).doc('_info').set({
                    createdAt: Date.now(),
                    userId: userId,
                    type: 'contact_collection'
                });
                console.log(`[Firebase] Nova coleção criada para usuário ${userId}`);
            }
            
            // Adicionamos à lista de coleções verificadas
            this.existingCollections.add(userId);
        } catch (error) {
            console.error(`[Firebase] Erro ao verificar/criar coleção para ${userId}:`, error);
        }
    }

    // Salva contexto de mensagem
    async saveMessageContext(userId, messageId, context) {
        // Garantir que a coleção do usuário existe
        await this.ensureCollectionExists(userId);
        
        const messageRef = this.db.collection(userId).doc(messageId);
        await messageRef.set({
            messageId,
            timestamp: Date.now(),
            ...context
        });
    }

    // Salva mídia (imagem, áudio, vídeo)
    async saveMedia(userId, messageId, buffer, type, metadata = {}) {
        // Garantir que a coleção do usuário existe
        await this.ensureCollectionExists(userId);
        
        // Salva arquivo no Storage
        const path = `${userId}/${type}/${messageId}`;
        const file = this.bucket.file(path);
        await file.save(buffer);
        
        // Gera URL para download
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-01-2500' // Data bem futura para URL permanente
        });

        // Salva metadata no Firestore na coleção do usuário
        const mediaRef = this.db.collection(userId).doc(`media_${messageId}`);
        await mediaRef.set({
            messageId,
            type,
            url: url,
            timestamp: Date.now(),
            ...metadata
        });

        return url;
    }

    // Obtém contexto de mensagem
    async getMessageContext(userId, messageId) {
        const messageRef = this.db.collection(userId).doc(messageId);
        const messageSnap = await messageRef.get();
        return messageSnap.exists ? messageSnap.data() : null;
    }

    // Deleta contexto de mensagem
    async deleteMessageContext(userId, messageId) {
        try {
            const messageRef = this.db.collection(userId).doc(messageId);
            await messageRef.delete();
            return true;
        } catch (error) {
            console.error(`[Firebase] Erro ao deletar mensagem ${messageId} do usuário ${userId}:`, error);
            return false;
        }
    }

    // Deleta todas as mensagens de um usuário específico
    async deleteAllUserMessages(userId) {
        try {
            // Verifica se a coleção existe
            const collections = await this.db.listCollections();
            const collectionExists = collections.some(col => col.id === userId);
            
            if (!collectionExists) {
                console.log(`[Firebase] Nenhuma mensagem para excluir: coleção ${userId} não existe`);
                return true;
            }
            
            const batchSize = 500; // Tamanho máximo para operação em lote
            const collectionRef = this.db.collection(userId);
            const query = collectionRef.limit(batchSize);
            
            return await this.deleteQueryBatch(query);
        } catch (error) {
            console.error(`[Firebase] Erro ao excluir todas as mensagens do usuário ${userId}:`, error);
            return false;
        }
    }
    
    // Função auxiliar para exclusão em lote
    async deleteQueryBatch(query) {
        const snapshot = await query.get();
        
        if (snapshot.size === 0) {
            return true; // Nada mais para excluir
        }
        
        // Cria um lote para operações
        const batch = this.db.batch();
        
        // Adiciona cada documento ao lote para exclusão
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        
        // Commit do lote
        await batch.commit();
        console.log(`[Firebase] Excluído lote de ${snapshot.size} documentos`);
        
        // Se ainda houver documentos, chama recursivamente
        if (snapshot.size > 0) {
            return this.deleteQueryBatch(query);
        }
        
        return true;
    }

    // Obtém contexto de mídia
    async getMediaContext(userId, messageId, type) {
        const mediaRef = this.db.collection(userId).doc(`media_${messageId}`);
        const mediaSnap = await mediaRef.get();
        return mediaSnap.exists ? mediaSnap.data() : null;
    }

    // Obtém histórico recente do usuário
    async getUserHistory(userId, limitCount = 10) {
        try {
            // Garantir que a coleção do usuário existe
            await this.ensureCollectionExists(userId);
            
            // Busca documentos ordenados por timestamp
            const querySnapshot = await this.db.collection(userId)
                .orderBy('timestamp', 'desc')
                .limit(limitCount)
                .get();

            return querySnapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.log(`[Firebase] Aviso: Erro ao buscar histórico do usuário ${userId}:`, error);
            
            // Se falhar, tenta buscar sem ordenação e ordena manualmente
            try {
                const querySnapshot = await this.db.collection(userId)
                    .limit(50) // Limitamos a um número maior para depois filtrar
                    .get();

                return querySnapshot.docs
                    .map(doc => doc.data())
                    .filter(data => data.timestamp) // Filtra apenas documentos com timestamp
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, limitCount);
            } catch (fallbackError) {
                console.error(`[Firebase] Erro no fallback para getUserHistory:`, fallbackError);
                return [];
            }
        }
    }

    // Obtém conversa completa do usuário
    async getFullConversation(userId) {
        try {
            // Garantir que a coleção do usuário existe
            await this.ensureCollectionExists(userId);
            
            // Busca documentos ordenados por timestamp
            const querySnapshot = await this.db.collection(userId)
                .orderBy('timestamp', 'asc')
                .get();

            return querySnapshot.docs
                .map(doc => doc.data())
                .filter(data => !data.type); // Filtra documentos informativos
        } catch (error) {
            console.log(`[Firebase] Aviso: Erro ao buscar conversa completa do usuário ${userId}:`, error);
            
            // Se falhar, tenta buscar sem ordenação e ordena manualmente
            try {
                const querySnapshot = await this.db.collection(userId).get();

                return querySnapshot.docs
                    .map(doc => doc.data())
                    .filter(data => data.timestamp && !data.type) 
                    .sort((a, b) => a.timestamp - b.timestamp);
            } catch (fallbackError) {
                console.error(`[Firebase] Erro no fallback para getFullConversation:`, fallbackError);
                return [];
            }
        }
    }
    
    // Método para migrar dados do modelo antigo (uma coleção) para o novo modelo (coleções por usuário)
    async migrateOldData() {
        try {
            console.log("[Firebase] Iniciando migração de dados do modelo antigo...");
            
            // Verifica se existe a coleção 'conversations'
            const collections = await this.db.listCollections();
            const hasOldCollection = collections.some(col => col.id === 'conversations');
            
            if (!hasOldCollection) {
                console.log("[Firebase] Nenhuma coleção antiga 'conversations' encontrada. Nada a migrar.");
                return;
            }
            
            // Busca todas as mensagens na coleção antiga
            const oldMessages = await this.db.collection('conversations').get();
            console.log(`[Firebase] Encontradas ${oldMessages.size} mensagens para migrar`);
            
            if (oldMessages.empty) return;
            
            // Agrupa por usuário
            const messagesByUser = {};
            
            oldMessages.forEach(doc => {
                const data = doc.data();
                const userId = data.userId;
                
                if (!userId) return;
                
                if (!messagesByUser[userId]) {
                    messagesByUser[userId] = [];
                }
                
                messagesByUser[userId].push({
                    docId: doc.id,
                    data: data
                });
            });
            
            // Migra cada grupo para sua própria coleção
            for (const userId in messagesByUser) {
                console.log(`[Firebase] Migrando ${messagesByUser[userId].length} mensagens para o usuário ${userId}`);
                
                // Garante que a coleção do usuário existe
                await this.ensureCollectionExists(userId);
                
                // Migra as mensagens em lotes
                const messages = messagesByUser[userId];
                const batches = [];
                let currentBatch = this.db.batch();
                let operationCount = 0;
                
                for (const message of messages) {
                    const messageId = message.data.messageId;
                    if (!messageId) continue;
                    
                    const newDocRef = this.db.collection(userId).doc(messageId);
                    currentBatch.set(newDocRef, {
                        ...message.data,
                        migratedAt: Date.now()
                    });
                    
                    operationCount++;
                    
                    // Firestore tem limite de 500 operações por lote
                    if (operationCount >= 450) {
                        batches.push(currentBatch);
                        currentBatch = this.db.batch();
                        operationCount = 0;
                    }
                }
                
                // Adiciona o último lote se tiver operações
                if (operationCount > 0) {
                    batches.push(currentBatch);
                }
                
                // Executa os lotes
                for (let i = 0; i < batches.length; i++) {
                    await batches[i].commit();
                    console.log(`[Firebase] Migrado lote ${i+1}/${batches.length} para usuário ${userId}`);
                }
                
                console.log(`[Firebase] Migração completa para usuário ${userId}`);
            }
            
            console.log("[Firebase] Migração de dados concluída!");
            
            // Não deleta dados antigos por segurança
            console.log("[Firebase] NOTA: Os dados antigos na coleção 'conversations' foram mantidos para segurança.");
            console.log("[Firebase] Você pode excluir a coleção 'conversations' manualmente quando confirmar que a migração foi bem-sucedida.");
            
        } catch (error) {
            console.error("[Firebase] Erro durante a migração de dados:", error);
        }
    }
}

const firebaseManager = new FirebaseManager();

// Executa migração de dados ao iniciar, caso existam dados no formato antigo
firebaseManager.migrateOldData().catch(err => {
    console.error("[Firebase] Erro ao tentar migrar dados:", err);
});

export default firebaseManager;
