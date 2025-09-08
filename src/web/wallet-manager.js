/**
 * Gestionnaire de wallet pour YourMine
 */

class WalletManager {
    constructor() {
        this.isConnected = false;
        this.publicKey = null;
        this.connectionCallbacks = [];
        this.disconnectionCallbacks = [];
    }

    /**
     * Vérifie une connexion existante
     */
    async checkExistingConnection() {
        if (window.solana && window.solana.isPhantom) {
            try {
                const response = await window.solana.connect({ onlyIfTrusted: true });
                if (response.publicKey) {
                    await this.handleWalletConnected(response.publicKey);
                    return true;
                }
            } catch (error) {
                // Pas de connexion existante
            }
        }
        return false;
    }

    /**
     * Vérifie le retour depuis mobile
     */
    async checkMobileReturn() {
        if (YMUtils.isMobileDevice() && window.solana && window.solana.isConnected && window.solana.publicKey) {
            await this.handleWalletConnected(window.solana.publicKey);
            return true;
        }
        return false;
    }

    /**
     * Se connecte au wallet
     */
    async connect() {
        if (!window.solana) {
            if (YMUtils.isMobileDevice()) {
                const deepLink = YMUtils.createPhantomDeepLink();
                YMUtils.showNotification('Opening Phantom wallet...', 'info');
                window.location.href = deepLink;
                return;
            } else {
                YMUtils.showNotification('Please install Phantom wallet', 'error');
                window.open('https://phantom.app/', '_blank');
                return;
            }
        }
        
        try {
            YMUtils.showNotification('Connecting to wallet...', 'info');
            
            if (!window.solana.isConnected) {
                if (window.solana.isGlow) {
                    await window.solana.connect({
                        onlyIfTrusted: false,
                        commitment: 'confirmed'
                    });
                } else {
                    await window.solana.connect({
                        onlyIfTrusted: false
                    });
                }
            }
            
            if (!window.solana.publicKey) {
                await window.solana.connect();
            }
            
            await this.handleWalletConnected(window.solana.publicKey);
            
        } catch (err) {
            YMUtils.showNotification('Failed to connect to wallet', 'error');
            throw err;
        }
    }

    /**
     * Se déconnecte du wallet
     */
    async disconnect() {
        try {
            if (window.solana && window.solana.isConnected) {
                await window.solana.disconnect();
            }
        } catch (error) {
            // Ignorer les erreurs de déconnexion
        } finally {
            await this.handleWalletDisconnected();
        }
    }

    /**
     * Gère la connexion du wallet
     */
    async handleWalletConnected(publicKey) {
        this.isConnected = true;
        this.publicKey = publicKey;
        
        YMUtils.showNotification('Wallet connected successfully!', 'success');
        
        // Notifier tous les callbacks
        for (const callback of this.connectionCallbacks) {
            try {
                await callback(publicKey);
            } catch (error) {
                console.error('Erreur dans le callback de connexion:', error);
            }
        }
    }

    /**
     * Gère la déconnexion du wallet
     */
    async handleWalletDisconnected() {
        this.isConnected = false;
        this.publicKey = null;
        
        YMUtils.showNotification('Wallet disconnected', 'info');
        
        // Notifier tous les callbacks
        for (const callback of this.disconnectionCallbacks) {
            try {
                await callback();
            } catch (error) {
                console.error('Erreur dans le callback de déconnexion:', error);
            }
        }
    }

    /**
     * Signe et envoie une transaction
     */
    async signAndSendTransaction(transaction) {
        if (!this.isConnected || !window.solana) {
            throw new Error('Wallet not connected');
        }

        try {
            const signature = await window.solana.signAndSendTransaction(transaction);
            return signature;
        } catch (error) {
            if (error.message && error.message.includes('User rejected')) {
                throw new Error('Transaction cancelled by user');
            }
            throw error;
        }
    }

    /**
     * Ajoute un callback de connexion
     */
    onConnect(callback) {
        this.connectionCallbacks.push(callback);
    }

    /**
     * Ajoute un callback de déconnexion
     */
    onDisconnect(callback) {
        this.disconnectionCallbacks.push(callback);
    }

    /**
     * Supprime un callback de connexion
     */
    offConnect(callback) {
        const index = this.connectionCallbacks.indexOf(callback);
        if (index > -1) {
            this.connectionCallbacks.splice(index, 1);
        }
    }

    /**
     * Supprime un callback de déconnexion
     */
    offDisconnect(callback) {
        const index = this.disconnectionCallbacks.indexOf(callback);
        if (index > -1) {
            this.disconnectionCallbacks.splice(index, 1);
        }
    }

    /**
     * Obtient l'adresse du wallet
     */
    getAddress() {
        return this.publicKey ? this.publicKey.toString() : null;
    }

    /**
     * Vérifie si le wallet est connecté
     */
    getIsConnected() {
        return this.isConnected;
    }

    /**
     * Obtient la clé publique
     */
    getPublicKey() {
        return this.publicKey;
    }
}

// Exposer la classe globalement
window.WalletManager = WalletManager;