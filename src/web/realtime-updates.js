/**
 * Gestionnaire de mises à jour en temps réel pour YourMine
 */

class RealtimeUpdatesManager {
    constructor(connection) {
        this.connection = connection;
        this.wsConnection = null;
        this.pollingInterval = null;
        this.subscriptionIds = new Map();
        this.updateCallbacks = [];
        this.isActive = false;
    }

    /**
     * Démarre les mises à jour en temps réel
     */
    async start(accounts) {
        if (this.isActive) {
            this.stop();
        }

        this.isActive = true;

        try {
            await this.setupWebSocketUpdates(accounts);
        } catch (error) {
            console.log('WebSocket failed, falling back to polling');
            this.setupPollingUpdates(accounts);
        }
    }

    /**
     * Arrête les mises à jour en temps réel
     */
    stop() {
        this.isActive = false;
        this.cleanup();
    }

    /**
     * Configure les mises à jour via WebSocket
     */
    async setupWebSocketUpdates(accounts) {
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = window.YM_CONFIG.NETWORK.replace('https://', 'wss://');
                this.wsConnection = new WebSocket(wsUrl);
                
                let connectionTimeout = setTimeout(() => {
                    this.wsConnection?.close();
                    reject(new Error("WebSocket connection timeout"));
                }, 5000);
                
                this.wsConnection.onopen = () => {
                    clearTimeout(connectionTimeout);
                    
                    // S'abonner aux comptes
                    if (accounts.userTokenAccount) {
                        this.subscribeToAccount(accounts.userTokenAccount, 'token');
                    }
                    if (accounts.userPublicKey) {
                        this.subscribeToAccount(accounts.userPublicKey, 'sol');
                    }
                    if (accounts.userAccount) {
                        this.subscribeToAccount(accounts.userAccount, 'user');
                    }
                    if (accounts.yrmMint) {
                        this.subscribeToAccount(accounts.yrmMint, 'mint');
                    }
                    
                    resolve();
                };
                
                this.wsConnection.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleWebSocketMessage(data);
                    } catch (error) {
                        // Erreur silencieuse
                    }
                };
                
                this.wsConnection.onerror = (error) => {
                    clearTimeout(connectionTimeout);
                    reject(error);
                };
                
                this.wsConnection.onclose = () => {
                    if (this.isActive) {
                        this.setupPollingUpdates(accounts);
                    }
                };
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * S'abonne aux mises à jour d'un compte
     */
    subscribeToAccount(publicKey, type) {
        if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
            return;
        }

        const id = Math.floor(Math.random() * 10000);
        this.subscriptionIds.set(id, type);
        
        this.wsConnection.send(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            method: "accountSubscribe",
            params: [
                publicKey.toString(),
                { 
                    commitment: "confirmed",
                    encoding: "base64"
                }
            ]
        }));
    }

    /**
     * Gère les messages WebSocket
     */
    handleWebSocketMessage(data) {
        if (data.method === "accountNotification") {
            const subscriptionType = this.subscriptionIds.get(data.params.subscription);
            const accountData = data.params.result;
            
            this.processAccountUpdate(subscriptionType, accountData);
        }
    }

    /**
     * Configure les mises à jour par polling
     */
    setupPollingUpdates(accounts) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        this.pollingInterval = setInterval(async () => {
            if (!this.isActive) return;

            try {
                const updates = {};

                // Solde SOL
                if (accounts.userPublicKey) {
                    const solBalance = await this.connection.getBalance(accounts.userPublicKey);
                    updates.solBalance = solBalance / solanaWeb3.LAMPORTS_PER_SOL;
                }

                // Solde YRM
                if (accounts.userTokenAccount) {
                    const tokenAccountInfo = await this.connection.getAccountInfo(accounts.userTokenAccount);
                    if (tokenAccountInfo?.data) {
                        const view = new DataView(tokenAccountInfo.data.buffer);
                        const balance = view.getBigUint64(64, true);
                        updates.yrmBalance = Number(balance) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
                    }
                }

                // Données utilisateur
                if (accounts.userAccount) {
                    const userAccountInfo = await this.connection.getAccountInfo(accounts.userAccount);
                    if (userAccountInfo?.data) {
                        updates.userData = YMUtils.parseUserAccountData(userAccountInfo.data);
                    }
                }

                // Supply totale
                if (accounts.yrmMint) {
                    const mintAccountInfo = await this.connection.getAccountInfo(accounts.yrmMint);
                    if (mintAccountInfo?.data) {
                        const view = new DataView(mintAccountInfo.data.buffer);
                        const supply = view.getBigUint64(36, true);
                        updates.totalSupply = Number(supply) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
                    }
                }

                // Notifier les callbacks s'il y a des changements
                this.notifyCallbacks(updates);
                
            } catch (error) {
                // Erreur silencieuse
            }
        }, 3000);
    }

    /**
     * Traite une mise à jour de compte
     */
    processAccountUpdate(type, accountData) {
        const updates = {};

        switch (type) {
            case 'token':
                if (accountData?.value?.data?.[0]) {
                    try {
                        const buffer = Buffer.from(accountData.value.data[0], 'base64');
                        const view = new DataView(buffer.buffer);
                        const balance = view.getBigUint64(64, true);
                        updates.yrmBalance = Number(balance) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
                    } catch (error) {
                        // Erreur silencieuse
                    }
                }
                break;

            case 'sol':
                if (accountData?.value?.lamports !== undefined) {
                    updates.solBalance = accountData.value.lamports / solanaWeb3.LAMPORTS_PER_SOL;
                }
                break;

            case 'user':
                if (accountData?.value?.data?.[0]) {
                    try {
                        const buffer = Buffer.from(accountData.value.data[0], 'base64');
                        updates.userData = YMUtils.parseUserAccountDataFromBuffer(buffer);
                    } catch (error) {
                        // Erreur silencieuse
                    }
                }
                break;

            case 'mint':
                if (accountData?.value?.data?.[0]) {
                    try {
                        const buffer = Buffer.from(accountData.value.data[0], 'base64');
                        const view = new DataView(buffer.buffer);
                        const supply = view.getBigUint64(36, true);
                        updates.totalSupply = Number(supply) / window.YM_CONFIG.YRM_DECIMALS_MULTIPLIER;
                    } catch (error) {
                        // Erreur silencieuse
                    }
                }
                break;
        }

        if (Object.keys(updates).length > 0) {
            this.notifyCallbacks(updates);
        }
    }

    /**
     * Notifie tous les callbacks des mises à jour
     */
    notifyCallbacks(updates) {
        for (const callback of this.updateCallbacks) {
            try {
                callback(updates);
            } catch (error) {
                console.error('Erreur dans le callback de mise à jour:', error);
            }
        }
    }

    /**
     * Ajoute un callback de mise à jour
     */
    onUpdate(callback) {
        this.updateCallbacks.push(callback);
    }

    /**
     * Supprime un callback de mise à jour
     */
    offUpdate(callback) {
        const index = this.updateCallbacks.indexOf(callback);
        if (index > -1) {
            this.updateCallbacks.splice(index, 1);
        }
    }

    /**
     * Nettoie toutes les ressources
     */
    cleanup() {
        // Fermer WebSocket
        if (this.wsConnection) {
            try {
                // Se désabonner de tous les comptes
                for (const [id] of this.subscriptionIds) {
                    this.wsConnection.send(JSON.stringify({
                        jsonrpc: "2.0",
                        id: id,
                        method: "accountUnsubscribe",
                        params: [id]
                    }));
                }
                
                this.wsConnection.close();
            } catch (error) {
                // Erreur silencieuse
            }
            this.wsConnection = null;
        }
        
        this.subscriptionIds.clear();
        
        // Arrêter le polling
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Vérifie si les mises à jour sont actives
     */
    isRunning() {
        return this.isActive;
    }
}

// Exposer la classe globalement
window.RealtimeUpdatesManager = RealtimeUpdatesManager;